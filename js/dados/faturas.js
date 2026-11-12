/* Faturas de cartão (RF-19 a RF-22).

   - Cada fatura é identificada pelo cartão e pelo mês do vencimento (AAAA-MM).
   - São criadas sozinhas: ao registrar uma compra (uma fatura por parcela) e, ao abrir o programa,
     para a fatura atual e a seguinte de cada cartão ativo.
   - O total de uma fatura nunca é gravado: vem das parcelas do mês + ajustes + encargos.
   - Pagar uma fatura cria um lançamento "pagamento_fatura" na conta escolhida. Ele mexe só no
     saldo da conta; não é despesa (a despesa é cada parcela, na fatura em que cai).
   - Ajustes, estornos e mudança de parcela só valem enquanto a fatura não tem pagamento. */
(function () {
  'use strict';

  const U = App.util;
  const D = App.dados;
  const Erro = App.ErroValidacao;
  const C = App.calc.cartoes;

  const TIPOS_ENCARGO = { juros: 'Juros', multa: 'Multa', outros: 'Outros encargos' };
  const CATEGORIA_ENCARGOS = 'Encargos de cartão';

  function idDaFatura(cartao, mes) {
    return 'fat_' + cartao.id.replace(/^car_/, '') + '_' + mes;
  }

  function obter(id) {
    return D.registros('faturas').find(function (f) {
      return f.id === id;
    });
  }

  function obterPorMes(cartaoId, mes) {
    return D.registros('faturas').find(function (f) {
      return f.cartaoId === cartaoId && f.mes === mes;
    });
  }

  function rotulo(fatura) {
    const cartao = App.cartoes.obter(fatura.cartaoId);
    return (cartao ? cartao.nome : 'Cartão') + ' ' + U.formatarMes(fatura.mes);
  }

  /* ---------- Cálculo sobre os dados atuais ---------- */

  function contexto(hoje) {
    return C.criarContexto({
      faturas: D.registros('faturas'),
      compras: D.registros('compras_cartao'),
      lancamentos: D.registros('lancamentos'),
      hoje: hoje || U.hojeISO(),
    });
  }

  function info(fatura, hoje, ctx) {
    return C.infoDaFatura(fatura, ctx || contexto(hoje));
  }

  function resumoDoCartao(cartao, hoje) {
    return C.resumoDoCartao(cartao, contexto(hoje));
  }

  // Cria a fatura (só na memória) se ela ainda não existir.
  function garantir(cartao, mes) {
    const existente = obterPorMes(cartao.id, mes);
    if (existente) return { fatura: existente, criada: false };
    const agora = U.agoraISO();
    const fatura = Object.assign({ id: idDaFatura(cartao, mes), cartaoId: cartao.id, mes: mes }, C.datasDaFatura(cartao, mes), {
      situacao: 'aberta',
      ajustes: [],
      encargos: [],
      pagamentoIds: [],
      criadoEm: agora,
      alteradoEm: agora,
    });
    D.registros('faturas').push(fatura);
    return { fatura: fatura, criada: true };
  }

  // Grava em cada fatura a situação calculada (aberta, fechada, paga_parcial ou paga).
  function sincronizarSituacoes(hoje) {
    const ctx = contexto(hoje);
    const agora = U.agoraISO();
    let mudou = false;
    D.registros('faturas').forEach(function (f) {
      const situacao = C.infoDaFatura(f, ctx).situacao;
      if (f.situacao !== situacao) {
        f.situacao = situacao;
        f.alteradoEm = agora;
        mudou = true;
      }
    });
    return mudou;
  }

  // RF-19: chamada ao abrir o programa. Devolve { criadas, salvo }.
  async function gerarFaturas(hoje) {
    const dia = hoje || U.hojeISO();
    let criadas = 0;
    App.cartoes.listar().forEach(function (cartao) {
      if (!cartao.ativo) return;
      const atual = C.mesDaFatura(cartao, dia);
      [atual, U.somarMeses(atual, 1)].forEach(function (mes) {
        if (garantir(cartao, mes).criada) criadas++;
      });
    });
    const mudou = sincronizarSituacoes(dia);
    const salvo = criadas || mudou ? await D.gravar(['faturas']) : true;
    return { criadas: criadas, salvo: salvo };
  }

  /* ---------- Regras de edição ---------- */

  function exigir(id) {
    const fatura = obter(id);
    if (!fatura) throw new Erro('Fatura não encontrada.');
    return fatura;
  }

  // RF-20: com pagamento registrado, a fatura não aceita mais ajustes nem parcelas movidas.
  function exigirSemPagamento(fatura, hoje, ctx) {
    if (info(fatura, hoje, ctx).temPagamento) {
      throw new Erro(
        'A fatura ' + rotulo(fatura) + ' já tem pagamento e não aceita mais essa alteração. ' +
          'Desfaça o pagamento antes, se precisar.'
      );
    }
  }

  function atualizar(fatura, hoje) {
    fatura.situacao = info(fatura, hoje).situacao;
    fatura.alteradoEm = U.agoraISO();
  }

  /* ---------- Ajustes (RF-20) ---------- */

  // valor em centavos: negativo é crédito (desconto), positivo é cobrança a mais.
  async function adicionarAjuste(faturaId, dados, hoje) {
    const fatura = exigir(faturaId);
    const descricao = D.textoObrigatorio(dados.descricao, 'a descrição do ajuste', 80);
    if (!Number.isSafeInteger(dados.valor) || dados.valor === 0) {
      throw new Erro('Informe um valor diferente de zero. Use sinal negativo para um crédito (desconto), como -50,00.');
    }
    exigirSemPagamento(fatura, hoje);
    fatura.ajustes.push({ id: U.gerarId('aju'), descricao: descricao, valor: dados.valor, tipo: 'manual' });
    atualizar(fatura, hoje);
    return D.gravar(['faturas']);
  }

  async function removerAjuste(faturaId, ajusteId, hoje) {
    const fatura = exigir(faturaId);
    const ajuste = fatura.ajustes.find(function (a) {
      return a.id === ajusteId;
    });
    if (!ajuste) throw new Erro('Ajuste não encontrado.');
    if (ajuste.tipo === 'estorno_total') {
      throw new Erro('O crédito de um estorno total não pode ser removido por aqui.');
    }
    // O estorno total já descontou os parciais do que devolveu; tirar um deles agora deixaria a devolução incompleta.
    const compraDoAjuste = ajuste.compraId ? App.compras.obter(ajuste.compraId) : null;
    if (compraDoAjuste && compraDoAjuste.situacao !== 'ativa') {
      throw new Erro('A compra "' + compraDoAjuste.descricao + '" já está ' + compraDoAjuste.situacao + ' e este crédito faz parte do valor devolvido; ele não pode ser removido.');
    }
    exigirSemPagamento(fatura, hoje);
    fatura.ajustes.splice(fatura.ajustes.indexOf(ajuste), 1);
    // Crédito de estorno parcial: tira também o registro do estorno na compra.
    if (ajuste.compraId) {
      const compra = App.compras.obter(ajuste.compraId);
      if (compra) {
        compra.estornos = compra.estornos.filter(function (e) {
          return e.ajusteId !== ajuste.id;
        });
        compra.alteradoEm = U.agoraISO();
      }
    }
    atualizar(fatura, hoje);
    return D.gravar(['faturas', 'compras_cartao']);
  }

  /* ---------- Encargos: juros, multas e outros (RF-22) ---------- */

  async function adicionarEncargo(faturaId, dados, hoje) {
    const fatura = exigir(faturaId);
    if (!TIPOS_ENCARGO[dados.tipo]) throw new Erro('Escolha o tipo do encargo.');
    if (!Number.isSafeInteger(dados.valor) || dados.valor <= 0) throw new Erro('Informe o valor do encargo, maior que zero.');
    const descricao = D.textoOpcional(dados.descricao, 'a descrição do encargo', 80) || TIPOS_ENCARGO[dados.tipo];
    if (info(fatura, hoje).situacao === 'paga') {
      throw new Erro('A fatura ' + rotulo(fatura) + ' já está paga. Registre o encargo na fatura seguinte.');
    }
    // O encargo é a única despesa nova da fatura e usa a categoria "Encargos de cartão".
    const alvo = App.categorias.garantirDoSistema(CATEGORIA_ENCARGOS);
    fatura.encargos.push({
      id: U.gerarId('enc'),
      tipo: dados.tipo,
      valor: dados.valor,
      descricao: descricao,
      categoriaId: alvo.categoria.id,
    });
    atualizar(fatura, hoje);
    return D.gravar(alvo.criada ? ['faturas', 'categorias'] : ['faturas']);
  }

  async function removerEncargo(faturaId, encargoId, hoje) {
    const fatura = exigir(faturaId);
    const encargo = fatura.encargos.find(function (e) {
      return e.id === encargoId;
    });
    if (!encargo) throw new Erro('Encargo não encontrado.');
    exigirSemPagamento(fatura, hoje);
    fatura.encargos.splice(fatura.encargos.indexOf(encargo), 1);
    atualizar(fatura, hoje);
    return D.gravar(['faturas']);
  }

  /* ---------- Pagamento (RF-21) ---------- */

  // dados: { contaId, valor, data }. Integral ou parcial: o valor não pode passar do saldo.
  async function pagar(faturaId, dados, hoje) {
    const fatura = exigir(faturaId);
    const resumo = info(fatura, hoje);
    const conta = App.contas.obter(dados.contaId);
    if (!conta) throw new Erro('Escolha a conta de onde sai o pagamento.');
    if (!conta.ativa) throw new Erro('A conta "' + conta.nome + '" está inativa. Escolha outra conta.');
    if (resumo.saldo <= 0) throw new Erro('Esta fatura não tem saldo a pagar.');
    if (!Number.isSafeInteger(dados.valor) || dados.valor <= 0) throw new Erro('Informe o valor do pagamento, maior que zero.');
    if (dados.valor > resumo.saldo) {
      throw new Erro('O valor é maior que o saldo da fatura (' + U.formatarMoeda(resumo.saldo) + ').');
    }
    if (!U.ehDataISO(dados.data)) throw new Erro('Informe a data do pagamento.');
    const lancamento = App.lancamentos.montarMovimento(
      'pagamento_fatura',
      {
        descricao: 'Pagamento da fatura ' + rotulo(fatura),
        valor: dados.valor,
        categoriaId: null,
        contaId: conta.id,
        dataCompetencia: dados.data,
        dataVencimento: null,
        dataPagamento: dados.data,
        situacao: 'pago',
        observacao: '',
      },
      { origem: { faturaId: fatura.id } }
    );
    D.registros('lancamentos').push(lancamento);
    fatura.pagamentoIds.push(lancamento.id);
    atualizar(fatura, hoje);
    return D.gravar(['lancamentos', 'faturas']);
  }

  // Desfaz um pagamento lançado por engano: o dinheiro volta para a conta.
  async function desfazerPagamento(faturaId, lancamentoId, hoje) {
    const fatura = exigir(faturaId);
    if (!fatura.pagamentoIds.includes(lancamentoId)) throw new Erro('Pagamento não encontrado nesta fatura.');
    const lista = D.registros('lancamentos');
    const indice = lista.findIndex(function (l) {
      return l.id === lancamentoId;
    });
    if (indice >= 0) lista.splice(indice, 1);
    fatura.pagamentoIds = fatura.pagamentoIds.filter(function (id) {
      return id !== lancamentoId;
    });
    atualizar(fatura, hoje);
    return D.gravar(['lancamentos', 'faturas']);
  }

  App.faturas = {
    TIPOS_ENCARGO: TIPOS_ENCARGO,
    idDaFatura: idDaFatura,
    obter: obter,
    obterPorMes: obterPorMes,
    rotulo: rotulo,
    contexto: contexto,
    info: info,
    resumoDoCartao: resumoDoCartao,
    garantir: garantir,
    sincronizarSituacoes: sincronizarSituacoes,
    gerarFaturas: gerarFaturas,
    exigirSemPagamento: exigirSemPagamento,
    atualizar: atualizar,
    adicionarAjuste: adicionarAjuste,
    removerAjuste: removerAjuste,
    adicionarEncargo: adicionarEncargo,
    removerEncargo: removerEncargo,
    pagar: pagar,
    desfazerPagamento: desfazerPagamento,
  };
})();
