/* Cálculo de cartões de crédito (RF-18, RF-19, RF-24, RF-25; regra 6.3). Funções puras:
   recebem os registros e devolvem números em centavos e textos. Nada é gravado.

   Conceitos
   - O "mês da fatura" (AAAA-MM) é o mês do VENCIMENTO da fatura.
   - Compras até o dia de fechamento entram na fatura que fecha naquele mês; depois dele, na
     seguinte. No próprio dia do fechamento vale a configuração do cartão (padrão: seguinte).
   - Se o vencimento é depois do fechamento no calendário (fecha dia 3, vence dia 10), a fatura
     vence no mês em que fecha; senão (fecha dia 25, vence dia 5), vence no mês seguinte.
   - Dia que não existe no mês (31 em fevereiro) vira o último dia do mês.
   - Total da fatura = parcelas do mês + ajustes + encargos. Saldo = total - pagamentos.
   - Limite utilizado = soma dos saldos de todas as faturas (inclusive as futuras). */
(function () {
  'use strict';

  const U = App.util;

  /* ---------- Em que fatura cai uma compra ---------- */

  // Mês em que fecha a fatura que recebe a compra feita em `dataISO`.
  function mesDeFechamentoDaCompra(cartao, dataISO) {
    const mes = dataISO.slice(0, 7);
    const dia = Number(dataISO.slice(8, 10));
    const fechamento = Number(U.dataNoMes(mes, cartao.diaFechamento).slice(8, 10));
    if (dia < fechamento) return mes;
    if (dia > fechamento) return U.somarMeses(mes, 1);
    return cartao.compraNoDiaFechamento === 'atual' ? mes : U.somarMeses(mes, 1);
  }

  function mesDoVencimento(cartao, mesDeFechamento) {
    return cartao.diaVencimento > cartao.diaFechamento ? mesDeFechamento : U.somarMeses(mesDeFechamento, 1);
  }

  // Mês (AAAA-MM do vencimento) da fatura que recebe uma compra feita na data informada.
  function mesDaFatura(cartao, dataISO) {
    return mesDoVencimento(cartao, mesDeFechamentoDaCompra(cartao, dataISO));
  }

  // Datas de fechamento e de vencimento da fatura do mês (AAAA-MM do vencimento).
  function datasDaFatura(cartao, mes) {
    const mesDeFechamento = cartao.diaVencimento > cartao.diaFechamento ? mes : U.somarMeses(mes, -1);
    return {
      dataFechamento: U.dataNoMes(mesDeFechamento, cartao.diaFechamento),
      dataVencimento: U.dataNoMes(mes, cartao.diaVencimento),
    };
  }

  /* ---------- Parcelas ---------- */

  // Divide em centavos inteiros; a diferença fica na primeira parcela (regra 6.3).
  function dividirParcelas(valorTotal, quantidade) {
    const base = Math.floor(valorTotal / quantidade);
    const resto = valorTotal - base * quantidade;
    return Array.from({ length: quantidade }, function (_, i) {
      return i === 0 ? base + resto : base;
    });
  }

  // Faturas de cada parcela, uma por mês a partir da fatura da compra.
  function mesesDasParcelas(cartao, dataCompra, quantidade) {
    const primeiro = mesDaFatura(cartao, dataCompra);
    return Array.from({ length: quantidade }, function (_, i) {
      return U.somarMeses(primeiro, i);
    });
  }

  // Lista pronta das parcelas de uma compra, para gravar ou para mostrar na prévia.
  function montarParcelas(cartao, dataCompra, valorTotal, quantidade) {
    const valores = dividirParcelas(valorTotal, quantidade);
    const meses = mesesDasParcelas(cartao, dataCompra, quantidade);
    return valores.map(function (valor, i) {
      return { numero: i + 1, valor: valor, mesFatura: meses[i], situacao: 'ativa' };
    });
  }

  /* ---------- Totais das faturas ---------- */

  function soma(lista) {
    return (lista || []).reduce(function (t, item) {
      return t + item.valor;
    }, 0);
  }

  // Agrupa as parcelas ativas por "cartaoId|mes" (uma passada só, para o dashboard ser rápido).
  function indexarParcelas(compras) {
    const indice = {};
    compras.forEach(function (compra) {
      compra.parcelas.forEach(function (parcela) {
        if (parcela.situacao !== 'ativa') return;
        const chave = compra.cartaoId + '|' + parcela.mesFatura;
        const entrada = indice[chave] || (indice[chave] = { total: 0, itens: [] });
        entrada.total += parcela.valor;
        entrada.itens.push({ compra: compra, parcela: parcela });
      });
    });
    return indice;
  }

  function mapaPagamentos(lancamentos) {
    const mapa = {};
    lancamentos.forEach(function (l) {
      if (l.tipo === 'pagamento_fatura') mapa[l.id] = l;
    });
    return mapa;
  }

  function criarContexto(dados) {
    return {
      faturas: dados.faturas,
      hoje: dados.hoje,
      indice: indexarParcelas(dados.compras),
      pagamentos: mapaPagamentos(dados.lancamentos),
    };
  }

  // Situação (aberta, fechada, paga_parcial, paga) e valores de uma fatura.
  // Só depois do dia de fechamento a fatura passa de aberta para fechada.
  function infoDaFatura(fatura, ctx) {
    const entrada = ctx.indice[fatura.cartaoId + '|' + fatura.mes];
    const parcelas = entrada ? entrada.total : 0;
    const ajustes = soma(fatura.ajustes);
    const encargos = soma(fatura.encargos);
    const total = parcelas + ajustes + encargos;
    let pago = 0;
    fatura.pagamentoIds.forEach(function (id) {
      const l = ctx.pagamentos[id];
      if (l && (l.situacao === 'pago' || l.situacao === 'recebido')) pago += l.valor;
    });
    const saldo = total - pago;
    let situacao;
    if (pago > 0) situacao = saldo > 0 ? 'paga_parcial' : 'paga';
    else situacao = ctx.hoje > fatura.dataFechamento ? 'fechada' : 'aberta';
    return {
      fatura: fatura,
      itens: entrada ? entrada.itens : [],
      parcelas: parcelas,
      ajustes: ajustes,
      encargos: encargos,
      total: total,
      pago: pago,
      saldo: saldo,
      situacao: situacao,
      temPagamento: pago > 0,
    };
  }

  function detalharFaturas(cartaoId, ctx) {
    return ctx.faturas
      .filter(function (f) {
        return f.cartaoId === cartaoId;
      })
      .sort(function (a, b) {
        return a.mes.localeCompare(b.mes);
      })
      .map(function (f) {
        return infoDaFatura(f, ctx);
      });
  }

  // RF-24 e RF-25: limite e parcelas futuras de um cartão.
  //  - faturaAtual: a que recebe uma compra feita hoje.
  //  - aPagar: saldo das faturas até a atual. parcelasFuturas: saldo das faturas depois dela.
  //  - utilizado = aPagar + futuras (soma dos saldos de todas as faturas, nunca abaixo de zero).
  function resumoDoCartao(cartao, ctx) {
    const lista = detalharFaturas(cartao.id, ctx);
    const mesAtual = mesDaFatura(cartao, ctx.hoje);
    let aPagar = 0;
    let futuras = 0;
    const parcelasFuturas = [];
    lista.forEach(function (info) {
      if (info.fatura.mes <= mesAtual) {
        aPagar += info.saldo;
      } else {
        futuras += info.saldo;
        info.itens.forEach(function (item) {
          parcelasFuturas.push({ compra: item.compra, parcela: item.parcela, mes: info.fatura.mes });
        });
      }
    });
    parcelasFuturas.sort(function (a, b) {
      return a.mes.localeCompare(b.mes) || a.compra.descricao.localeCompare(b.compra.descricao, 'pt-BR');
    });
    const utilizado = Math.max(0, aPagar + futuras);
    return {
      limite: cartao.limite,
      utilizado: utilizado,
      disponivel: cartao.limite - utilizado,
      mesAtual: mesAtual,
      faturaAtual: lista.find(function (i) { return i.fatura.mes === mesAtual; }) || null,
      faturas: lista,
      aPagar: aPagar,
      saldoFuturas: futuras,
      parcelasFuturas: parcelasFuturas,
      totalComprometido: soma(
        parcelasFuturas.map(function (p) {
          return { valor: p.parcela.valor };
        })
      ),
    };
  }

  App.calc.cartoes = {
    mesDeFechamentoDaCompra: mesDeFechamentoDaCompra,
    mesDaFatura: mesDaFatura,
    datasDaFatura: datasDaFatura,
    dividirParcelas: dividirParcelas,
    mesesDasParcelas: mesesDasParcelas,
    montarParcelas: montarParcelas,
    criarContexto: criarContexto,
    infoDaFatura: infoDaFatura,
    detalharFaturas: detalharFaturas,
    resumoDoCartao: resumoDoCartao,
  };
})();
