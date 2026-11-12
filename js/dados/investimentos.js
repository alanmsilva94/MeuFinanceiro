/* Investimentos, movimentações e atualizações de valor (RF-26 a RF-31).

   Cada aporte, resgate, rendimento ou taxa grava DUAS coisas juntas: o lançamento na conta
   (lancamentos.json) e a movimentação no investimento (investimentos.json), ligados por
   `lancamentoId` e por `origem.investimentoId`. Tudo é validado antes de gravar.

   Como cada movimentação aparece no dinheiro (regras 6.2 e 6.4)
   - aporte: sai da conta; não é despesa.
   - resgate: volta para a conta; não é receita. Registre o valor LÍQUIDO recebido (IR retido já descontado).
   - rendimento: receita na categoria "Rendimentos de investimentos"; também entra na rentabilidade.
   - taxa: cobrada à parte na conta; reduz saldo e rentabilidade, mas não é despesa de consumo. */
(function () {
  'use strict';

  const U = App.util;
  const D = App.dados;
  const Erro = App.ErroValidacao;

  const CLASSES = {
    renda_fixa: 'Renda fixa',
    renda_variavel: 'Ações, ETFs e BDRs',
    fii: 'FIIs',
    cripto: 'Criptomoedas',
    outros: 'Previdência, fundos e outros',
  };

  // Tipo da movimentação -> como vira lançamento na conta.
  const MOVIMENTACOES = {
    aporte: { rotulo: 'Aporte', lancamento: 'aporte', situacao: 'pago' },
    resgate: { rotulo: 'Resgate', lancamento: 'resgate', situacao: 'recebido' },
    rendimento: { rotulo: 'Rendimento', lancamento: 'receita', situacao: 'recebido' },
    taxa: { rotulo: 'Taxa', lancamento: 'taxa_investimento', situacao: 'pago' },
  };

  const CATEGORIA_RENDIMENTOS = 'Rendimentos de investimentos';

  function listar(incluirEncerrados) {
    return D.registros('investimentos')
      .filter(function (i) {
        return incluirEncerrados || i.ativo;
      })
      .sort(D.porNome);
  }

  function obter(id) {
    return D.registros('investimentos').find(function (i) {
      return i.id === id;
    });
  }

  function exigir(id) {
    const inv = obter(id);
    if (!inv) throw new Erro('Investimento não encontrado.');
    return inv;
  }

  function resumo(inv, ate) {
    return App.calc.investimentos.resumoDoInvestimento(inv, ate);
  }

  function resumoDaCarteira(ate) {
    return App.calc.investimentos.resumoDaCarteira(D.registros('investimentos'), ate);
  }

  /* ---------- Cadastro (RF-26) ---------- */

  // Quantidade é opcional (cotas, ações, moedas) e pode ser fracionada, como 0,00215.
  function validarQuantidade(valor) {
    if (valor === '' || valor === null || valor === undefined) return null;
    const n = Number(valor);
    if (!Number.isFinite(n) || n < 0 || n > 1e12) throw new Erro('A quantidade precisa ser um número igual ou maior que zero.');
    return Math.round(n * 1e8) / 1e8;
  }

  function validar(dados, idAtual) {
    const nome = D.textoObrigatorio(dados.nome, 'o nome do investimento', 80);
    if (!CLASSES[dados.classe]) throw new Erro('Escolha a classe do investimento.');
    const instituicao = D.textoObrigatorio(dados.instituicao, 'a instituição', 60);
    const repetido = D.registros('investimentos').some(function (i) {
      return i.id !== idAtual && D.chaveDeNome(i.nome) === D.chaveDeNome(nome);
    });
    if (repetido) throw new Erro('Já existe um investimento chamado "' + nome + '". Use outro nome.');
    return { nome: nome, classe: dados.classe, instituicao: instituicao, quantidade: validarQuantidade(dados.quantidade) };
  }

  async function criar(dados) {
    const valores = validar(dados, null);
    const agora = U.agoraISO();
    D.registros('investimentos').push(
      Object.assign({ id: U.gerarId('inv') }, valores, {
        ativo: true,
        movimentacoes: [],
        atualizacoes: [],
        criadoEm: agora,
        alteradoEm: agora,
      })
    );
    return D.gravar(['investimentos']);
  }

  async function editar(id, dados) {
    const inv = exigir(id);
    Object.assign(inv, validar(dados, id), { alteradoEm: U.agoraISO() });
    return D.gravar(['investimentos']);
  }

  // Encerrar exige valor atual zero, para o valor não ficar contando no patrimônio sem aparecer na lista.
  async function definirAtivo(id, ativo) {
    const inv = exigir(id);
    if (!ativo && resumo(inv).valorAtual > 0) {
      throw new Erro(
        'O investimento ainda tem valor atual de ' + U.formatarMoeda(resumo(inv).valorAtual) +
          '. Registre o resgate e atualize o valor para R$ 0,00 antes de encerrar.'
      );
    }
    inv.ativo = !!ativo;
    inv.alteradoEm = U.agoraISO();
    return D.gravar(['investimentos']);
  }

  // Quem tem movimentações já mexeu em contas; nesse caso só dá para encerrar.
  async function excluir(id) {
    const inv = exigir(id);
    if (inv.movimentacoes.length) {
      throw new Erro(
        'O investimento "' + inv.nome + '" tem ' + inv.movimentacoes.length +
          ' movimentação(ões) e não pode ser excluído. Para encerrá-lo, registre o resgate e zere o valor atual.'
      );
    }
    const lista = D.registros('investimentos');
    lista.splice(lista.indexOf(inv), 1);
    return D.gravar(['investimentos']);
  }

  /* ---------- Movimentações (RF-27 a RF-29) ---------- */

  // dados: { contaId, valor, data, observacao }.
  async function registrar(investimentoId, tipo, dados) {
    const inv = exigir(investimentoId);
    const cfg = MOVIMENTACOES[tipo];
    if (!cfg) throw new Erro('Tipo de movimentação inválido.');
    if (!inv.ativo) throw new Erro('O investimento "' + inv.nome + '" está encerrado. Reative-o para registrar movimentações.');
    const conta = App.contas.obter(dados.contaId);
    if (!conta) throw new Erro('Escolha a conta.');
    if (!conta.ativa) throw new Erro('A conta "' + conta.nome + '" está inativa. Escolha outra conta.');
    if (!Number.isSafeInteger(dados.valor) || dados.valor <= 0) throw new Erro('Informe um valor maior que zero.');
    if (!U.ehDataISO(dados.data)) throw new Erro('Informe a data da movimentação.');
    const observacao = D.textoOpcional(dados.observacao, 'a observação', 300);

    let categoriaId = null;
    let categoriaCriada = false;
    if (tipo === 'rendimento') {
      const alvo = App.categorias.garantirDoSistema(CATEGORIA_RENDIMENTOS);
      categoriaId = alvo.categoria.id;
      categoriaCriada = alvo.criada;
    }
    const lancamento = App.lancamentos.montarMovimento(
      cfg.lancamento,
      {
        descricao: cfg.rotulo + ': ' + inv.nome,
        valor: dados.valor,
        categoriaId: categoriaId,
        contaId: conta.id,
        dataCompetencia: dados.data,
        dataVencimento: null,
        dataPagamento: dados.data,
        situacao: cfg.situacao,
        observacao: observacao,
      },
      { origem: { investimentoId: inv.id } }
    );
    D.registros('lancamentos').push(lancamento);
    inv.movimentacoes.push({ tipo: tipo, data: dados.data, valor: dados.valor, lancamentoId: lancamento.id });
    inv.movimentacoes.sort(function (a, b) {
      return a.data.localeCompare(b.data);
    });
    inv.alteradoEm = U.agoraISO();
    return D.gravar(categoriaCriada ? ['investimentos', 'lancamentos', 'categorias'] : ['investimentos', 'lancamentos']);
  }

  // Desfaz a movimentação e o lançamento que ela gerou, juntos.
  async function excluirMovimentacao(investimentoId, lancamentoId) {
    const inv = exigir(investimentoId);
    const indice = inv.movimentacoes.findIndex(function (m) {
      return m.lancamentoId === lancamentoId;
    });
    if (indice < 0) throw new Erro('Movimentação não encontrada.');
    inv.movimentacoes.splice(indice, 1);
    const lista = D.registros('lancamentos');
    const posicao = lista.findIndex(function (l) {
      return l.id === lancamentoId;
    });
    if (posicao >= 0) lista.splice(posicao, 1);
    inv.alteradoEm = U.agoraISO();
    return D.gravar(['investimentos', 'lancamentos']);
  }

  /* ---------- Valor atual (RF-30) ---------- */

  // Uma atualização por data: informar de novo a mesma data corrige o valor.
  async function atualizarValor(investimentoId, dados) {
    const inv = exigir(investimentoId);
    if (!U.ehDataISO(dados.data)) throw new Erro('Informe a data do valor atual.');
    if (!Number.isSafeInteger(dados.valorAtual) || dados.valorAtual < 0) {
      throw new Erro('Informe o valor atual, como 5.234,00 (use 0,00 se não resta nada).');
    }
    const existente = inv.atualizacoes.find(function (a) {
      return a.data === dados.data;
    });
    if (existente) existente.valorAtual = dados.valorAtual;
    else inv.atualizacoes.push({ data: dados.data, valorAtual: dados.valorAtual });
    inv.atualizacoes.sort(function (a, b) {
      return a.data.localeCompare(b.data);
    });
    inv.alteradoEm = U.agoraISO();
    return D.gravar(['investimentos']);
  }

  async function removerAtualizacao(investimentoId, data) {
    const inv = exigir(investimentoId);
    const indice = inv.atualizacoes.findIndex(function (a) {
      return a.data === data;
    });
    if (indice < 0) throw new Erro('Atualização não encontrada.');
    inv.atualizacoes.splice(indice, 1);
    inv.alteradoEm = U.agoraISO();
    return D.gravar(['investimentos']);
  }

  App.investimentos = {
    CLASSES: CLASSES,
    MOVIMENTACOES: MOVIMENTACOES,
    listar: listar,
    obter: obter,
    resumo: resumo,
    resumoDaCarteira: resumoDaCarteira,
    criar: criar,
    editar: editar,
    definirAtivo: definirAtivo,
    excluir: excluir,
    registrar: registrar,
    excluirMovimentacao: excluirMovimentacao,
    atualizarValor: atualizarValor,
    removerAtualizacao: removerAtualizacao,
  };
})();
