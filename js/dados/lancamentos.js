/* Lançamentos. Na fase 2 só existem as transferências entre contas (RF-03).
   Uma transferência é um único lançamento: sai de uma conta e entra em outra, sem
   virar receita nem despesa (regra 6.2). As fases 3 a 6 acrescentam os demais tipos. */
(function () {
  'use strict';

  const U = App.util;
  const D = App.dados;
  const Erro = App.ErroValidacao;

  function obter(id) {
    return D.registros('lancamentos').find(function (l) {
      return l.id === id;
    });
  }

  // Transferências cuja data cai no mês informado (AAAA-MM), da mais recente para a mais antiga.
  function listarTransferencias(mes) {
    return D.registros('lancamentos')
      .filter(function (l) {
        return l.tipo === 'transferencia' && (!mes || String(l.dataPagamento).slice(0, 7) === mes);
      })
      .sort(function (a, b) {
        return String(b.dataPagamento).localeCompare(String(a.dataPagamento)) || String(b.criadoEm).localeCompare(String(a.criadoEm));
      });
  }

  // `atual` é a transferência sendo editada: ela pode manter uma conta que já foi inativada.
  function validarTransferencia(dados, atual) {
    const origem = App.contas.obter(dados.contaId);
    const destino = App.contas.obter(dados.contaDestinoId);
    if (!origem) throw new Erro('Escolha a conta de origem.');
    if (!destino) throw new Erro('Escolha a conta de destino.');
    if (origem.id === destino.id) throw new Erro('A conta de origem e a de destino precisam ser diferentes.');
    if (!origem.ativa && !(atual && atual.contaId === origem.id)) {
      throw new Erro('A conta "' + origem.nome + '" está inativa. Reative-a ou escolha outra conta.');
    }
    if (!destino.ativa && !(atual && atual.contaDestinoId === destino.id)) {
      throw new Erro('A conta "' + destino.nome + '" está inativa. Reative-a ou escolha outra conta.');
    }
    if (!Number.isSafeInteger(dados.valor) || dados.valor <= 0) throw new Erro('Informe um valor maior que zero.');
    if (!U.ehDataISO(dados.data)) throw new Erro('Informe a data da transferência.');
    return {
      valor: dados.valor,
      contaId: origem.id,
      contaDestinoId: destino.id,
      data: dados.data,
      observacao: D.textoOpcional(dados.observacao, 'a observação', 300),
    };
  }

  async function criarTransferencia(dados) {
    const v = validarTransferencia(dados, null);
    const agora = U.agoraISO();
    D.registros('lancamentos').push({
      id: U.gerarId('lan'),
      tipo: 'transferencia',
      descricao: 'Transferência',
      valor: v.valor,
      categoriaId: null,
      contaId: v.contaId,
      contaDestinoId: v.contaDestinoId,
      dataCompetencia: v.data,
      dataVencimento: null,
      dataPagamento: v.data,
      situacao: 'pago',
      recorrenciaId: null,
      origem: null,
      observacao: v.observacao,
      criadoEm: agora,
      alteradoEm: agora,
    });
    return D.gravar(['lancamentos']);
  }

  async function editarTransferencia(id, dados) {
    const lancamento = obter(id);
    if (!lancamento || lancamento.tipo !== 'transferencia') throw new Erro('Transferência não encontrada.');
    const v = validarTransferencia(dados, lancamento);
    Object.assign(lancamento, {
      valor: v.valor,
      contaId: v.contaId,
      contaDestinoId: v.contaDestinoId,
      dataCompetencia: v.data,
      dataPagamento: v.data,
      observacao: v.observacao,
      alteradoEm: U.agoraISO(),
    });
    return D.gravar(['lancamentos']);
  }

  async function excluirTransferencia(id) {
    const lancamento = obter(id);
    if (!lancamento || lancamento.tipo !== 'transferencia') throw new Erro('Transferência não encontrada.');
    const lista = D.registros('lancamentos');
    lista.splice(lista.indexOf(lancamento), 1);
    return D.gravar(['lancamentos']);
  }

  /* ---------- Receitas e despesas (RF-08 a RF-12) ---------- */

  // Textos e regras de cada tipo. A situação "efetivada" é recebido (receita) ou pago (despesa).
  const MOVIMENTOS = {
    receita: {
      natureza: 'receita',
      efetivada: 'recebido',
      participio: 'recebida',
      vencimento: 'a previsão de recebimento',
      natLabel: 'de receita',
    },
    despesa: {
      natureza: 'despesa',
      efetivada: 'pago',
      participio: 'paga',
      vencimento: 'o vencimento',
      natLabel: 'de despesa',
    },
  };

  // Lançamentos gerados pela tela Investimentos (rendimentos) só mudam por lá, para o
  // investimento e a conta nunca ficarem em desacordo.
  function movimentoEditavel(id) {
    const l = obterMovimento(id);
    if (!l) throw new Erro('Lançamento não encontrado.');
    if (l.origem && l.origem.investimentoId) {
      throw new Erro('Este lançamento foi gerado na tela Investimentos. Altere ou exclua a movimentação por lá.');
    }
    return l;
  }
  function obterMovimento(id) {
    const l = obter(id);
    return l && MOVIMENTOS[l.tipo] ? l : undefined;
  }

  // Campos que lançamentos e modelos de recorrência têm em comum: descrição, valor, categoria e conta.
  // `atual` é o registro sendo editado: ele pode manter uma conta que foi inativada depois.
  function validarNucleo(tipo, dados, atual) {
    const cfg = MOVIMENTOS[tipo];
    if (!cfg) throw new Erro('Tipo de lançamento inválido.');
    const descricao = D.textoObrigatorio(dados.descricao, 'a descrição', 120);
    if (!Number.isSafeInteger(dados.valor) || dados.valor <= 0) {
      throw new Erro('Informe um valor maior que zero, como 1.250,00.');
    }
    const categoria = App.categorias.obter(dados.categoriaId);
    if (!categoria) throw new Erro('Escolha a categoria.');
    if (categoria.natureza !== cfg.natureza) {
      throw new Erro('A categoria "' + categoria.nome + '" não é ' + cfg.natLabel + '. Escolha outra.');
    }
    const conta = App.contas.obter(dados.contaId);
    if (!conta) throw new Erro('Escolha a conta.');
    if (!conta.ativa && !(atual && atual.contaId === conta.id)) {
      throw new Erro('A conta "' + conta.nome + '" está inativa. Reative-a ou escolha outra conta.');
    }
    return { cfg: cfg, descricao: descricao, categoria: categoria, conta: conta };
  }

  function validarMovimento(tipo, dados, atual) {
    const nucleo = validarNucleo(tipo, dados, atual);
    const cfg = nucleo.cfg;
    const descricao = nucleo.descricao;
    const categoria = nucleo.categoria;
    const conta = nucleo.conta;
    if (!U.ehDataISO(dados.dataCompetencia)) throw new Erro('Informe a data de competência.');
    const vencimento = dados.dataVencimento ? dados.dataVencimento : null;
    if (vencimento && !U.ehDataISO(vencimento)) throw new Erro('A data de ' + cfg.vencimento + ' é inválida.');
    if (dados.situacao !== 'pendente' && dados.situacao !== cfg.efetivada) throw new Erro('Escolha a situação.');
    let pagamento = null;
    if (dados.situacao === cfg.efetivada) {
      if (!U.ehDataISO(dados.dataPagamento)) {
        throw new Erro('Informe a data em que a ' + (tipo === 'receita' ? 'entrada foi recebida' : 'saída foi paga') + '.');
      }
      pagamento = dados.dataPagamento;
    }
    return {
      descricao: descricao,
      valor: dados.valor,
      categoriaId: categoria.id,
      contaId: conta.id,
      dataCompetencia: dados.dataCompetencia,
      dataVencimento: vencimento,
      dataPagamento: pagamento,
      situacao: dados.situacao,
      observacao: D.textoOpcional(dados.observacao, 'a observação', 300),
    };
  }

  // Monta o registro completo (sem gravar). `extras` traz recorrenciaId e origem quando o
  // lançamento nasce de uma recorrência.
  function montarMovimento(tipo, v, extras) {
    const agora = U.agoraISO();
    return Object.assign(
      { id: U.gerarId('lan'), tipo: tipo, contaDestinoId: null, recorrenciaId: null, origem: null },
      v,
      extras || {},
      { criadoEm: agora, alteradoEm: agora }
    );
  }

  async function criarMovimento(tipo, dados) {
    const v = validarMovimento(tipo, dados, null);
    D.registros('lancamentos').push(montarMovimento(tipo, v));
    return D.gravar(['lancamentos']);
  }

  // RF-15: editar uma ocorrência de recorrência altera só ela; o modelo não muda.
  async function editarMovimento(id, dados) {
    const lancamento = movimentoEditavel(id);
    Object.assign(lancamento, validarMovimento(lancamento.tipo, dados, lancamento), { alteradoEm: U.agoraISO() });
    if (App.recorrencias) App.recorrencias.avaliarPersonalizada(lancamento);
    return D.gravar(['lancamentos']);
  }

  async function excluirMovimento(id) {
    const lancamento = movimentoEditavel(id);
    const lista = D.registros('lancamentos');
    lista.splice(lista.indexOf(lancamento), 1);
    return D.gravar(['lancamentos']);
  }

  // RF-09/RF-11: marca como pago ou recebido, sempre com a data efetiva.
  async function efetivar(id, data) {
    const lancamento = movimentoEditavel(id);
    if (!U.ehDataISO(data)) {
      throw new Erro('Informe a data em que foi ' + (lancamento.tipo === 'receita' ? 'recebido' : 'pago') + '.');
    }
    lancamento.situacao = MOVIMENTOS[lancamento.tipo].efetivada;
    lancamento.dataPagamento = data;
    lancamento.alteradoEm = U.agoraISO();
    return D.gravar(['lancamentos']);
  }

  // Volta um lançamento pago/recebido para pendente (por exemplo, marcado por engano).
  async function desfazerEfetivacao(id) {
    const lancamento = movimentoEditavel(id);
    lancamento.situacao = 'pendente';
    lancamento.dataPagamento = null;
    lancamento.alteradoEm = U.agoraISO();
    return D.gravar(['lancamentos']);
  }

  // Receitas ou despesas filtradas (RF-10). O período usa a data de competência.
  // filtro: { de, ate, categoriaId, contaId, situacao } (campos vazios não filtram).
  function listarMovimentos(tipo, filtro) {
    const f = filtro || {};
    return D.registros('lancamentos')
      .filter(function (l) {
        if (l.tipo !== tipo) return false;
        if (f.de && l.dataCompetencia < f.de) return false;
        if (f.ate && l.dataCompetencia > f.ate) return false;
        if (f.categoriaId && l.categoriaId !== f.categoriaId) return false;
        if (f.contaId && l.contaId !== f.contaId) return false;
        if (f.situacao && l.situacao !== f.situacao) return false;
        return true;
      })
      .sort(function (a, b) {
        return (
          String(b.dataCompetencia).localeCompare(String(a.dataCompetencia)) ||
          String(b.criadoEm).localeCompare(String(a.criadoEm))
        );
      });
  }

  App.lancamentos = {
    MOVIMENTOS: MOVIMENTOS,
    obter: obter,
    obterMovimento: obterMovimento,
    validarNucleo: validarNucleo,
    validarMovimento: validarMovimento,
    montarMovimento: montarMovimento,
    listarMovimentos: listarMovimentos,
    criarMovimento: criarMovimento,
    editarMovimento: editarMovimento,
    excluirMovimento: excluirMovimento,
    efetivar: efetivar,
    desfazerEfetivacao: desfazerEfetivacao,
    listarTransferencias: listarTransferencias,
    criarTransferencia: criarTransferencia,
    editarTransferencia: editarTransferencia,
    excluirTransferencia: excluirTransferencia,
  };
})();
