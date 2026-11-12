/* Cálculos do dashboard (RF-32 a RF-37; regras 6.1, 6.3 e 6.5). Funções puras, em centavos.

   Duas visões do dinheiro
   - Resultado (consumo): receitas e despesas pela data de COMPETÊNCIA. Pendente aparece como
     "previsto", nunca somado ao realizado. As despesas incluem cada parcela de cartão no mês da
     sua fatura (pela data de vencimento dela), os encargos e os ajustes da fatura.
   - Caixa: entradas e saídas REALIZADAS pela data de pagamento ou recebimento. Pagamento de fatura,
     aporte e taxa de investimento são saídas de caixa, mas não são despesa de consumo.
   - Patrimônio líquido = saldos das contas + valor atual dos investimentos - faturas a pagar - parcelas futuras.

   Histórico: para comparar com o mês anterior, o saldo, os investimentos e as faturas são
   reconstruídos a partir dos registros atuais, na data pedida. Compras entram a partir da data da
   compra, ajustes a partir do fechamento da fatura e encargos a partir do vencimento. Parcelas
   canceladas depois não voltam ao passado.

   Filtros: categoria vale para receitas e despesas. Conta e cartão são alternativas de origem:
   com uma conta, entram os lançamentos dela; com um cartão, as despesas dele; com os dois, as duas coisas.
   Sem nenhum dos dois, entra tudo. */
(function () {
  'use strict';

  const U = App.util;
  const M = App.calc;

  const SEM_CATEGORIA = '__sem_categoria';

  /* ---------- Preparação (índices, para cada cálculo ser uma passada só) ---------- */

  // dados: { contas, lancamentos, cartoes, compras, faturas, investimentos } (as listas de registros).
  function preparar(dados) {
    const cartaoPorId = {};
    dados.cartoes.forEach(function (c) { cartaoPorId[c.id] = c; });
    const faturaPorChave = {};
    const faturaPorId = {};
    dados.faturas.forEach(function (f) {
      faturaPorChave[f.cartaoId + '|' + f.mes] = f;
      faturaPorId[f.id] = f;
    });
    const compraPorId = {};
    dados.compras.forEach(function (c) { compraPorId[c.id] = c; });

    function dataDaFatura(compra, mes) {
      const f = faturaPorChave[compra.cartaoId + '|' + mes];
      if (f) return f.dataVencimento;
      const cartao = cartaoPorId[compra.cartaoId];
      return cartao ? M.cartoes.datasDaFatura(cartao, mes).dataVencimento : mes + '-01';
    }

    // Tudo o que a fatura de cartão soma como despesa de consumo, com a data de competência.
    const itensCartao = [];
    dados.compras.forEach(function (compra) {
      compra.parcelas.forEach(function (p) {
        if (p.situacao !== 'ativa') return;
        itensCartao.push({
          data: dataDaFatura(compra, p.mesFatura), valor: p.valor, categoriaId: compra.categoriaId,
          cartaoId: compra.cartaoId, tipo: 'parcela',
        });
      });
    });
    dados.faturas.forEach(function (f) {
      f.encargos.forEach(function (e) {
        itensCartao.push({ data: f.dataVencimento, valor: e.valor, categoriaId: e.categoriaId || null, cartaoId: f.cartaoId, tipo: 'encargo' });
      });
      f.ajustes.forEach(function (a) {
        const compra = a.compraId ? compraPorId[a.compraId] : null;
        itensCartao.push({ data: f.dataVencimento, valor: a.valor, categoriaId: compra ? compra.categoriaId : null, cartaoId: f.cartaoId, tipo: 'ajuste' });
      });
    });

    return {
      dados: dados,
      cartaoPorId: cartaoPorId,
      faturaPorId: faturaPorId,
      itensCartao: itensCartao,
      pagamentosDeFatura: dados.lancamentos.filter(function (l) { return l.tipo === 'pagamento_fatura'; }),
    };
  }

  /* ---------- Filtros ---------- */

  // Conta e cartão são alternativas de origem (ver o comentário do topo).
  function passaOrigem(filtro, contaId, cartaoId) {
    const temConta = !!filtro.contaId;
    const temCartao = !!filtro.cartaoId;
    if (!temConta && !temCartao) return true;
    return (temConta && contaId === filtro.contaId) || (temCartao && cartaoId === filtro.cartaoId);
  }

  /* ---------- Resultado (competência) ---------- */

  function somar(mapa, chave, valor) {
    mapa[chave] = (mapa[chave] || 0) + valor;
  }

  // Receitas e despesas de [de, ate] (datas de competência).
  function resultado(P, de, ate, filtro) {
    const f = filtro || {};
    const r = { receitas: 0, receitasPrevistas: 0, despesas: 0, despesasPrevistas: 0, despesasCartao: 0, porCategoria: {} };
    P.dados.lancamentos.forEach(function (l) {
      if (l.tipo !== 'receita' && l.tipo !== 'despesa') return;
      const data = l.dataCompetencia;
      if (data < de || data > ate) return;
      if (f.categoriaId && l.categoriaId !== f.categoriaId) return;
      if (!passaOrigem(f, l.contaId, null)) return;
      const real = M.realizado(l);
      if (l.tipo === 'receita') {
        if (real) r.receitas += l.valor;
        else r.receitasPrevistas += l.valor;
      } else if (real) {
        r.despesas += l.valor;
        somar(r.porCategoria, l.categoriaId || SEM_CATEGORIA, l.valor);
      } else {
        r.despesasPrevistas += l.valor;
      }
    });
    P.itensCartao.forEach(function (item) {
      if (item.data < de || item.data > ate) return;
      if (f.categoriaId && item.categoriaId !== f.categoriaId) return;
      if (!passaOrigem(f, null, item.cartaoId)) return;
      r.despesas += item.valor;
      r.despesasCartao += item.valor;
      somar(r.porCategoria, item.categoriaId || SEM_CATEGORIA, item.valor);
    });
    r.resultado = r.receitas - r.despesas;
    return r;
  }

  /* ---------- Caixa ---------- */

  const ENTRADAS_DE_CAIXA = { receita: 'receitas', resgate: 'resgates' };
  const SAIDAS_DE_CAIXA = { despesa: 'despesas', pagamento_fatura: 'faturas', aporte: 'aportes', taxa_investimento: 'taxas' };

  // Dinheiro que entrou e saiu das contas em [de, ate] (datas de pagamento/recebimento).
  function caixa(P, de, ate, filtro) {
    const f = filtro || {};
    const detalhe = { receitas: 0, resgates: 0, despesas: 0, faturas: 0, aportes: 0, taxas: 0 };
    let entradas = 0;
    let saidas = 0;
    P.dados.lancamentos.forEach(function (l) {
      if (!M.realizado(l)) return;
      const entrada = ENTRADAS_DE_CAIXA[l.tipo];
      const saida = SAIDAS_DE_CAIXA[l.tipo];
      if (!entrada && !saida) return; // transferência não é entrada nem saída
      if (l.dataPagamento < de || l.dataPagamento > ate) return;
      if (f.categoriaId && (l.tipo !== 'receita' && l.tipo !== 'despesa' || l.categoriaId !== f.categoriaId)) return;
      let cartaoId = null;
      if (l.tipo === 'pagamento_fatura' && l.origem && l.origem.faturaId && P.faturaPorId[l.origem.faturaId]) {
        cartaoId = P.faturaPorId[l.origem.faturaId].cartaoId;
      }
      if (!passaOrigem(f, l.contaId, cartaoId)) return;
      if (entrada) {
        entradas += l.valor;
        detalhe[entrada] += l.valor;
      } else {
        saidas += l.valor;
        detalhe[saida] += l.valor;
      }
    });
    return { entradas: entradas, saidas: saidas, liquido: entradas - saidas, detalhe: detalhe };
  }

  /* ---------- Saldos, investimentos, faturas e patrimônio em uma data ---------- */

  // Saldo das contas na data. Sem `contaId`, soma todas as contas (inclusive as inativas, que ainda
  // podem ter dinheiro); com ele, só aquela conta.
  function saldoEm(P, ate, contaId) {
    const saldos = M.saldos(P.dados.contas, P.dados.lancamentos, ate);
    return P.dados.contas.reduce(function (total, conta) {
      if (!(conta.id in saldos)) return total;
      if (contaId && conta.id !== contaId) return total;
      return total + saldos[conta.id];
    }, 0);
  }

  function investimentosEm(P, ate) {
    return M.investimentos.resumoDaCarteira(P.dados.investimentos, ate);
  }

  // Saldo das faturas na data, separado em "a pagar" (até a fatura do ciclo) e "parcelas futuras".
  function obrigacoesDeCartao(P, ate, cartaoId) {
    const parcelasPorFatura = {};
    P.dados.compras.forEach(function (compra) {
      if (compra.dataCompra > ate) return;
      compra.parcelas.forEach(function (p) {
        if (p.situacao === 'ativa') somar(parcelasPorFatura, compra.cartaoId + '|' + p.mesFatura, p.valor);
      });
    });
    const pagoPorFatura = {};
    P.pagamentosDeFatura.forEach(function (l) {
      if (!M.realizado(l) || l.dataPagamento > ate || !l.origem || !l.origem.faturaId) return;
      somar(pagoPorFatura, l.origem.faturaId, l.valor);
    });
    let aPagar = 0;
    let parcelasFuturas = 0;
    P.dados.faturas.forEach(function (f) {
      if (cartaoId && f.cartaoId !== cartaoId) return;
      const cartao = P.cartaoPorId[f.cartaoId];
      if (!cartao) return;
      let total = parcelasPorFatura[f.cartaoId + '|' + f.mes] || 0;
      if (ate >= f.dataFechamento) total += f.ajustes.reduce(function (t, a) { return t + a.valor; }, 0);
      if (ate >= f.dataVencimento) total += f.encargos.reduce(function (t, e) { return t + e.valor; }, 0);
      const saldo = total - (pagoPorFatura[f.id] || 0);
      if (f.mes <= M.cartoes.mesDaFatura(cartao, ate)) aPagar += saldo;
      else parcelasFuturas += saldo;
    });
    return { aPagar: aPagar, parcelasFuturas: parcelasFuturas };
  }

  // RF-33 e regra 6.5. Não é filtrado: o patrimônio é sempre o total.
  function patrimonio(P, ate) {
    const saldos = saldoEm(P, ate);
    const investimentos = investimentosEm(P, ate).valorAtual;
    const cartoes = obrigacoesDeCartao(P, ate);
    return {
      saldos: saldos,
      investimentos: investimentos,
      faturasAPagar: cartoes.aPagar,
      parcelasFuturas: cartoes.parcelasFuturas,
      patrimonio: saldos + investimentos - cartoes.aPagar - cartoes.parcelasFuturas,
    };
  }

  /* ---------- Fotografia de um período (os cards) ---------- */

  // Tudo o que os cards mostram para [de, ate]. Os valores de posição (saldo, investimentos, faturas,
  // patrimônio) são lidos no fim do período, ou hoje se o período ainda não terminou.
  function fotografia(P, de, ate, filtro, hoje) {
    const f = filtro || {};
    const corte = ate < hoje ? ate : hoje;
    const res = resultado(P, de, ate, f);
    const inv = investimentosEm(P, corte);
    const cartoes = obrigacoesDeCartao(P, corte, f.cartaoId);
    return {
      de: de,
      ate: ate,
      corte: corte,
      saldo: saldoEm(P, corte, f.contaId),
      receitas: res.receitas,
      receitasPrevistas: res.receitasPrevistas,
      despesas: res.despesas,
      despesasPrevistas: res.despesasPrevistas,
      despesasCartao: res.despesasCartao,
      resultado: res.resultado,
      porCategoria: res.porCategoria,
      investido: inv.valorAtual,
      rentabilidadeInvestimentos: inv.rentabilidade,
      faturasEmAberto: cartoes.aPagar,
      parcelasFuturas: cartoes.parcelasFuturas,
      patrimonio: patrimonio(P, corte).patrimonio,
      caixa: caixa(P, de, ate, f),
    };
  }

  // Período imediatamente anterior, do mesmo tamanho. Para um mês inteiro, é o mês anterior.
  function periodoAnterior(de, ate) {
    const inteiro = de.slice(8) === '01' && ate === U.ultimoDiaDaCompetencia(de.slice(0, 7)) && de.slice(0, 7) === ate.slice(0, 7);
    if (inteiro) {
      const mes = U.somarMeses(de.slice(0, 7), -1);
      return { de: mes + '-01', ate: U.ultimoDiaDaCompetencia(mes) };
    }
    const dias = U.diferencaDias(de, ate) + 1;
    return { de: U.somarDias(de, -dias), ate: U.somarDias(de, -1) };
  }

  // RF-34: variação em valor e em percentual (null quando o valor anterior é zero).
  function variacao(atual, anterior) {
    const delta = atual - anterior;
    return { delta: delta, pct: anterior !== 0 ? delta / Math.abs(anterior) : null };
  }

  /* ---------- Séries dos gráficos (RF-35) ---------- */

  function intervaloDoMes(mes) {
    return { de: mes + '-01', ate: U.ultimoDiaDaCompetencia(mes) };
  }

  // Receitas x despesas dos últimos n meses até `mesFinal`, com os mesmos filtros.
  function serieMensal(P, mesFinal, n, filtro) {
    const serie = [];
    for (let i = n - 1; i >= 0; i--) {
      const mes = U.somarMeses(mesFinal, -i);
      const { de, ate } = intervaloDoMes(mes);
      const r = resultado(P, de, ate, filtro);
      serie.push({ mes: mes, receitas: r.receitas, despesas: r.despesas, resultado: r.resultado });
    }
    return serie;
  }

  // Patrimônio no fim de cada um dos últimos n meses (o mês em curso vale até hoje).
  function evolucaoDoPatrimonio(P, mesFinal, n, hoje) {
    const serie = [];
    for (let i = n - 1; i >= 0; i--) {
      const mes = U.somarMeses(mesFinal, -i);
      const fim = intervaloDoMes(mes).ate;
      const p = patrimonio(P, fim < hoje ? fim : hoje);
      serie.push({ mes: mes, patrimonio: p.patrimonio, saldos: p.saldos, investimentos: p.investimentos });
    }
    return serie;
  }

  App.calc.painel = {
    SEM_CATEGORIA: SEM_CATEGORIA,
    preparar: preparar,
    resultado: resultado,
    caixa: caixa,
    saldoEm: saldoEm,
    investimentosEm: investimentosEm,
    obrigacoesDeCartao: obrigacoesDeCartao,
    patrimonio: patrimonio,
    fotografia: fotografia,
    periodoAnterior: periodoAnterior,
    variacao: variacao,
    intervaloDoMes: intervaloDoMes,
    serieMensal: serieMensal,
    evolucaoDoPatrimonio: evolucaoDoPatrimonio,
  };
})();
