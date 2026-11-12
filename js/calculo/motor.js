/* Motor de cálculo: toda conta financeira da aplicação passa por aqui (RNF-10).
   Funções puras: recebem os registros e devolvem números em centavos. Nada é gravado
   (os saldos são sempre recalculados, regra 6.6).

   Fase 2: saldos das contas. As fases seguintes acrescentam resultado, caixa,
   cartões e patrimônio neste mesmo objeto. */
(function () {
  'use strict';

  // Tipos que aumentam o saldo da conta onde acontecem.
  const TIPOS_ENTRADA = ['receita', 'resgate'];
  // Tipos que diminuem o saldo da conta onde acontecem.
  const TIPOS_SAIDA = ['despesa', 'aporte', 'pagamento_fatura', 'taxa_investimento'];

  // Só o que foi pago ou recebido mexe no saldo; pendente é apenas previsão (regra 6.1).
  function realizado(lancamento) {
    return lancamento.situacao === 'pago' || lancamento.situacao === 'recebido';
  }

  // Quanto o lançamento soma (ou subtrai) no saldo de uma conta específica.
  function efeitoNaConta(lancamento, contaId) {
    if (!realizado(lancamento)) return 0;
    if (lancamento.tipo === 'transferencia') {
      let efeito = 0;
      if (lancamento.contaId === contaId) efeito -= lancamento.valor;
      if (lancamento.contaDestinoId === contaId) efeito += lancamento.valor;
      return efeito;
    }
    if (lancamento.contaId !== contaId) return 0;
    if (TIPOS_ENTRADA.includes(lancamento.tipo)) return lancamento.valor;
    if (TIPOS_SAIDA.includes(lancamento.tipo)) return -lancamento.valor;
    return 0;
  }

  // Saldo de todas as contas, numa só passada pelos lançamentos: { idDaConta: centavos }.
  // Sem `ate`, é o saldo atual. Com `ate` (AAAA-MM-DD), é o saldo naquela data: só entram as
  // contas já abertas e os lançamentos pagos ou recebidos até ela (usado pelo dashboard).
  function saldos(contas, lancamentos, ate) {
    const resultado = {};
    contas.forEach(function (conta) {
      if (!ate || conta.dataAbertura <= ate) resultado[conta.id] = conta.saldoInicial;
    });
    lancamentos.forEach(function (lancamento) {
      if (!realizado(lancamento)) return;
      if (ate && lancamento.dataPagamento > ate) return;
      if (lancamento.contaId in resultado) {
        resultado[lancamento.contaId] += efeitoNaConta(lancamento, lancamento.contaId);
      }
      if (
        lancamento.tipo === 'transferencia' &&
        lancamento.contaDestinoId !== lancamento.contaId &&
        lancamento.contaDestinoId in resultado
      ) {
        resultado[lancamento.contaDestinoId] += efeitoNaConta(lancamento, lancamento.contaDestinoId);
      }
    });
    return resultado;
  }

  // Soma dos saldos de todas as contas. Inativar uma conta só a tira dos formulários: o dinheiro
  // que ainda há nela continua existindo e continua contando.
  function saldoTotal(contas, saldosPorConta) {
    return contas.reduce(function (total, conta) {
      return total + (saldosPorConta[conta.id] || 0);
    }, 0);
  }

  // Totais de uma lista de lançamentos (RF-12): o que já foi pago/recebido e o que ainda é
  // previsão. Pendente nunca é somado ao realizado (regra 6.1).
  function totaisPorSituacao(lancamentos) {
    let realizadoTotal = 0;
    let pendente = 0;
    lancamentos.forEach(function (lancamento) {
      if (realizado(lancamento)) realizadoTotal += lancamento.valor;
      else pendente += lancamento.valor;
    });
    return { realizado: realizadoTotal, pendente: pendente, total: realizadoTotal + pendente, quantidade: lancamentos.length };
  }

  App.calc = {
    realizado: realizado,
    efeitoNaConta: efeitoNaConta,
    saldos: saldos,
    saldoTotal: saldoTotal,
    totaisPorSituacao: totaisPorSituacao,
  };
})();
