/* Cálculo de investimentos (RF-30, RF-31; regra 6.4). Funções puras, em centavos.

   Rentabilidade em R$ = valor atual + resgates + rendimentos recebidos - aportes - taxas cobradas à parte
   Rentabilidade em %  = rentabilidade em R$ / total aportado

   O valor atual vem da última atualização manual, mais os aportes e menos os resgates feitos depois
   dela. Sem nenhuma atualização, usa-se o valor aportado líquido (aportes - resgates), marcado como
   "estimado": o programa não inventa ganho que o usuário não informou. */
(function () {
  'use strict';

  // Última atualização de valor até a data informada (vazio = a mais recente de todas).
  // Em empate de data vale a que foi gravada por último.
  function ultimaAtualizacao(investimento, ate) {
    let ultima = null;
    investimento.atualizacoes.forEach(function (a) {
      if (ate && a.data > ate) return;
      if (!ultima || a.data >= ultima.data) ultima = a;
    });
    return ultima;
  }

  // Resumo de um investimento. Com `ate`, considera só o que aconteceu até essa data
  // (usado para a evolução do patrimônio no dashboard).
  function resumoDoInvestimento(investimento, ate) {
    const soma = { aporte: 0, resgate: 0, rendimento: 0, taxa: 0 };
    investimento.movimentacoes.forEach(function (m) {
      if (ate && m.data > ate) return;
      if (m.tipo in soma) soma[m.tipo] += m.valor;
    });
    const atualizacao = ultimaAtualizacao(investimento, ate);
    // Dinheiro que entrou ou saiu do investimento DEPOIS da última atualização ainda não está no
    // valor informado: aporte soma, resgate subtrai. (Na mesma data da atualização, vale que o
    // valor informado já considera o movimento.) Sem isso, um aporte logo após atualizar faria o
    // patrimônio cair e um resgate total o duplicaria, até a próxima atualização.
    let posteriores = 0;
    if (atualizacao) {
      investimento.movimentacoes.forEach(function (m) {
        if ((ate && m.data > ate) || m.data <= atualizacao.data) return;
        if (m.tipo === 'aporte') posteriores += m.valor;
        else if (m.tipo === 'resgate') posteriores -= m.valor;
      });
    }
    const valorAtual = atualizacao ? Math.max(0, atualizacao.valorAtual + posteriores) : Math.max(0, soma.aporte - soma.resgate);
    const rentabilidade = valorAtual + soma.resgate + soma.rendimento - soma.aporte - soma.taxa;
    return {
      aportado: soma.aporte,
      resgatado: soma.resgate,
      rendimentos: soma.rendimento,
      taxas: soma.taxa,
      valorAtual: valorAtual,
      valorAtualEstimado: !atualizacao,
      valorAtualAjustado: posteriores !== 0,
      dataAtualizacao: atualizacao ? atualizacao.data : null,
      rentabilidade: rentabilidade,
      rentabilidadePct: soma.aporte > 0 ? rentabilidade / soma.aporte : null,
    };
  }

  // Resumo da carteira inteira e distribuição do valor atual por classe (RF-31 e RF-35).
  function resumoDaCarteira(investimentos, ate) {
    const total = { aportado: 0, resgatado: 0, rendimentos: 0, taxas: 0, valorAtual: 0, rentabilidade: 0 };
    const porClasse = {};
    investimentos.forEach(function (inv) {
      const r = resumoDoInvestimento(inv, ate);
      total.aportado += r.aportado;
      total.resgatado += r.resgatado;
      total.rendimentos += r.rendimentos;
      total.taxas += r.taxas;
      total.valorAtual += r.valorAtual;
      total.rentabilidade += r.rentabilidade;
      if (r.valorAtual > 0) porClasse[inv.classe] = (porClasse[inv.classe] || 0) + r.valorAtual;
    });
    total.rentabilidadePct = total.aportado > 0 ? total.rentabilidade / total.aportado : null;
    total.porClasse = Object.keys(porClasse)
      .map(function (classe) {
        return { classe: classe, valorAtual: porClasse[classe], pct: total.valorAtual > 0 ? porClasse[classe] / total.valorAtual : 0 };
      })
      .sort(function (a, b) {
        return b.valorAtual - a.valorAtual;
      });
    return total;
  }

  App.calc.investimentos = {
    ultimaAtualizacao: ultimaAtualizacao,
    resumoDoInvestimento: resumoDoInvestimento,
    resumoDaCarteira: resumoDaCarteira,
  };
})();
