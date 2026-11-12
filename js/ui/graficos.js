/* Gráficos do dashboard, desenhados em SVG e HTML, sem bibliotecas externas (funcionam offline).
   Cores, grades e tema vêm das variáveis de css/graficos.css, então o tema escuro funciona sozinho.

   Funções (todas devolvem HTML pronto):
     colunasAgrupadas({ rotulos, series: [{ nome, valores, cor }], titulo })
     linha({ rotulos, valores, nome, titulo })
     ranking({ itens: [{ rotulo, valor }], formatoExtra })
     legenda([{ nome, cor }])
     tabela({ colunas, linhas })
   ativarTooltips(raiz) liga a dica ao passar o mouse nos elementos com data-tip.

   Valores monetários entram em centavos. Cada gráfico tem uma visão em tabela e um nome
   acessível; o valor de cada ponto fica na dica e na tabela, e a legenda aparece quando há
   duas ou mais séries. */
(function () {
  'use strict';

  const U = App.util;
  const esc = U.escaparHtml;

  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const compacto = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });

  const LARGURA = 720;
  const ALTURA = 280;
  const MARGEM = { topo: 14, direita: 14, base: 30, esquerda: 54 };
  const LARGURA_MAX_BARRA = 24; // espessura máxima de cada barra
  const FOLGA_ENTRE_BARRAS = 2; // vão na cor da superfície entre barras que se tocam
  const RAIO = 4; // canto arredondado só na ponta dos dados

  function rotuloMes(mes) {
    return MESES[Number(mes.slice(5)) - 1] + '/' + mes.slice(2, 4);
  }

  function rotuloEixo(centavos) {
    return compacto.format(centavos / 100);
  }

  function numero(n) {
    return Math.round(n * 100) / 100;
  }

  // Escala com números redondos: [minimo, maximo] -> { lo, hi, passo }, com cerca de 4 divisões.
  function escala(minimo, maximo) {
    const bruto = Math.max(maximo - minimo, 100);
    const alvo = bruto / 4;
    const potencia = Math.pow(10, Math.floor(Math.log10(alvo)));
    const fracao = alvo / potencia;
    const passo = (fracao <= 1 ? 1 : fracao <= 2 ? 2 : fracao <= 2.5 ? 2.5 : fracao <= 5 ? 5 : 10) * potencia;
    const lo = Math.floor(minimo / passo) * passo;
    let hi = Math.ceil(maximo / passo) * passo;
    if (hi <= lo) hi = lo + passo; // sem dados: ainda assim o eixo tem altura
    return { lo: lo, hi: hi, passo: passo };
  }

  function grade(esc_, escalaY, y, largura) {
    let svg = '';
    for (let v = esc_.lo; v <= esc_.hi + esc_.passo / 1000; v += esc_.passo) {
      const yy = numero(y(v));
      svg +=
        '<line class="vz-grade' + (v === 0 ? ' vz-eixo' : '') + '" x1="' + MARGEM.esquerda + '" x2="' + (MARGEM.esquerda + largura) + '" y1="' + yy + '" y2="' + yy + '"/>' +
        '<text class="vz-texto" x="' + (MARGEM.esquerda - 8) + '" y="' + (yy + 4) + '" text-anchor="end">' + esc(rotuloEixo(v)) + '</text>';
    }
    return svg;
  }

  // Barra com cantos arredondados só no topo e a base reta, apoiada na linha de base.
  function caminhoBarra(x, yTopo, largura, yBase) {
    const altura = yBase - yTopo;
    if (altura <= 0) return '';
    const r = Math.min(RAIO, largura / 2, altura);
    return (
      'M' + numero(x) + ' ' + numero(yBase) + 'L' + numero(x) + ' ' + numero(yTopo + r) +
      'Q' + numero(x) + ' ' + numero(yTopo) + ' ' + numero(x + r) + ' ' + numero(yTopo) +
      'L' + numero(x + largura - r) + ' ' + numero(yTopo) +
      'Q' + numero(x + largura) + ' ' + numero(yTopo) + ' ' + numero(x + largura) + ' ' + numero(yTopo + r) +
      'L' + numero(x + largura) + ' ' + numero(yBase) + 'Z'
    );
  }

  // O separador das linhas da dica é um caractere que não aparece em nomes digitados pelo usuário
  // (um nome de categoria com "|" não pode quebrar a dica).
  const SEPARADOR_DA_DICA = '␟';

  function dica(titulo, linhas) {
    return esc([titulo].concat(linhas).join(SEPARADOR_DA_DICA));
  }

  /* ---------- Colunas agrupadas (uma por mês, uma barra por série) ---------- */

  function colunasAgrupadas(o) {
    const n = o.rotulos.length;
    const largura = LARGURA - MARGEM.esquerda - MARGEM.direita;
    const altura = ALTURA - MARGEM.topo - MARGEM.base;
    const maximo = Math.max.apply(null, [0].concat(o.series.reduce(function (t, s) { return t.concat(s.valores); }, [])));
    const esc_ = escala(0, maximo);
    const y = function (v) { return MARGEM.topo + altura - (v / esc_.hi) * altura; };
    const yBase = MARGEM.topo + altura;
    const faixa = largura / n;
    const ns = o.series.length;
    const barra = Math.min(LARGURA_MAX_BARRA, (faixa * 0.7 - FOLGA_ENTRE_BARRAS * (ns - 1)) / ns);
    const grupo = ns * barra + (ns - 1) * FOLGA_ENTRE_BARRAS;

    let svg = grade(esc_, null, y, largura);
    for (let i = 0; i < n; i++) {
      const x0 = MARGEM.esquerda + i * faixa;
      const xGrupo = x0 + (faixa - grupo) / 2;
      const linhas = o.series.map(function (s) { return s.nome + ': ' + U.formatarMoeda(s.valores[i]); });
      svg += '<g class="vz-coluna" data-tip="' + dica(rotuloMes(o.rotulos[i]), linhas) + '">';
      svg += '<rect class="vz-acerto" x="' + numero(x0) + '" y="' + MARGEM.topo + '" width="' + numero(faixa) + '" height="' + altura + '"/>';
      o.series.forEach(function (s, k) {
        const v = Math.max(0, s.valores[i]);
        svg += '<path d="' + caminhoBarra(xGrupo + k * (barra + FOLGA_ENTRE_BARRAS), y(v), barra, yBase) + '" style="fill:' + s.cor + '"/>';
      });
      svg += '</g>';
      svg += '<text class="vz-texto" x="' + numero(x0 + faixa / 2) + '" y="' + (yBase + 18) + '" text-anchor="middle">' + esc(rotuloMes(o.rotulos[i])) + '</text>';
    }
    return (
      '<svg class="vz" viewBox="0 0 ' + LARGURA + ' ' + ALTURA + '" role="img" aria-label="' + esc(o.titulo) + '" preserveAspectRatio="xMidYMid meet">' + svg + '</svg>'
    );
  }

  /* ---------- Linha (uma série ao longo dos meses) ---------- */

  function linha(o) {
    const n = o.rotulos.length;
    const largura = LARGURA - MARGEM.esquerda - MARGEM.direita;
    const altura = ALTURA - MARGEM.topo - MARGEM.base;
    const minimo = Math.min.apply(null, [0].concat(o.valores));
    const maximo = Math.max.apply(null, [0].concat(o.valores));
    const esc_ = escala(minimo, maximo);
    const y = function (v) { return MARGEM.topo + altura - ((v - esc_.lo) / (esc_.hi - esc_.lo)) * altura; };
    const yBase = y(Math.max(esc_.lo, 0));
    const faixa = largura / n;
    const x = function (i) { return MARGEM.esquerda + (i + 0.5) * faixa; };

    let svg = grade(esc_, null, y, largura);
    const pontos = o.valores.map(function (v, i) { return numero(x(i)) + ' ' + numero(y(v)); });
    // Área: um verniz de 10% da cor da série, nunca um bloco saturado.
    svg += '<path class="vz-area" d="M' + numero(x(0)) + ' ' + numero(yBase) + 'L' + pontos.join('L') + 'L' + numero(x(n - 1)) + ' ' + numero(yBase) + 'Z"/>';
    svg += '<path class="vz-linha" d="M' + pontos.join('L') + '"/>';
    for (let i = 0; i < n; i++) {
      const x0 = MARGEM.esquerda + i * faixa;
      svg +=
        '<g class="vz-ponto" data-tip="' + dica(rotuloMes(o.rotulos[i]), [o.nome + ': ' + U.formatarMoeda(o.valores[i])]) + '">' +
        '<rect class="vz-acerto" x="' + numero(x0) + '" y="' + MARGEM.topo + '" width="' + numero(faixa) + '" height="' + altura + '"/>' +
        '<line class="vz-guia" x1="' + numero(x(i)) + '" x2="' + numero(x(i)) + '" y1="' + MARGEM.topo + '" y2="' + yBase + '"/>' +
        '<circle class="vz-marcador" cx="' + numero(x(i)) + '" cy="' + numero(y(o.valores[i])) + '" r="4"/></g>';
      svg += '<text class="vz-texto" x="' + numero(x(i)) + '" y="' + (MARGEM.topo + altura + 18) + '" text-anchor="middle">' + esc(rotuloMes(o.rotulos[i])) + '</text>';
    }
    // O ponto final leva o valor (rótulo seletivo) e o anel na cor da superfície.
    const ultimo = n - 1;
    svg += '<circle class="vz-marcador vz-marcador--fim" cx="' + numero(x(ultimo)) + '" cy="' + numero(y(o.valores[ultimo])) + '" r="4"/>';
    svg +=
      '<text class="vz-rotulo-fim" x="' + numero(x(ultimo)) + '" y="' + numero(y(o.valores[ultimo]) - 10) + '" text-anchor="end">' +
      esc(U.formatarMoeda(o.valores[ultimo])) + '</text>';
    return (
      '<svg class="vz" viewBox="0 0 ' + LARGURA + ' ' + ALTURA + '" role="img" aria-label="' + esc(o.titulo) + '" preserveAspectRatio="xMidYMid meet">' + svg + '</svg>'
    );
  }

  /* ---------- Ranking (barras horizontais, da maior para a menor, uma cor só) ---------- */

  // As maiores partes aparecem; o resto vira "Outras" (cinza), para não gerar cores a mais.
  function ranking(o) {
    const MAX = o.max || 7;
    const lista = o.itens.filter(function (i) { return i.valor > 0; }).sort(function (a, b) { return b.valor - a.valor; });
    if (!lista.length) return '<p class="vazio">' + esc(o.vazio || 'Sem dados no período.') + '</p>';
    const total = lista.reduce(function (t, i) { return t + i.valor; }, 0);
    let itens = lista;
    if (lista.length > MAX) {
      const resto = lista.slice(MAX - 1).reduce(function (t, i) { return t + i.valor; }, 0);
      itens = lista.slice(0, MAX - 1).concat([{ rotulo: 'Outras', valor: resto, neutro: true }]);
    }
    const maior = Math.max.apply(null, itens.map(function (i) { return i.valor; }));
    return (
      '<div class="vz-ranking">' +
      itens.map(function (i) {
        const pct = i.valor / total;
        return (
          '<div class="vz-ranking__linha" data-tip="' + dica(i.rotulo, [U.formatarMoeda(i.valor) + ' · ' + U.formatarPercentual(pct)]) + '">' +
          '<span class="vz-ranking__rotulo" title="' + esc(i.rotulo) + '">' + esc(i.rotulo) + '</span>' +
          '<div class="vz-ranking__trilho"><div class="vz-ranking__barra' + (i.neutro ? ' vz-ranking__barra--neutra' : '') + '" style="width:' + numero((i.valor / maior) * 100) + '%"></div></div>' +
          '<span class="vz-ranking__valor">' + U.formatarMoeda(i.valor) + ' <span class="texto-fraco">' + U.formatarPercentual(pct) + '</span></span></div>'
        );
      }).join('') + '</div>'
    );
  }

  /* ---------- Legenda e tabela ---------- */

  function legenda(series) {
    return (
      '<ul class="vz-legenda">' +
      series.map(function (s) {
        return '<li><span class="vz-legenda__marca" style="background:' + s.cor + '"></span>' + esc(s.nome) + '</li>';
      }).join('') + '</ul>'
    );
  }

  // Visão em tabela do mesmo gráfico: nada fica só na cor.
  function tabela(o) {
    return (
      '<details class="vz-tabela"><summary>Ver como tabela</summary><div class="tabela-rolagem"><table class="tabela"><thead><tr>' +
      o.colunas.map(function (c, i) { return '<th' + (i ? ' class="numero"' : '') + '>' + esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      o.linhas.map(function (l) {
        return '<tr>' + l.map(function (c, i) { return '<td' + (i ? ' class="numero"' : '') + '>' + esc(c) + '</td>'; }).join('') + '</tr>';
      }).join('') + '</tbody></table></div></details>'
    );
  }

  /* ---------- Dica ao passar o mouse ---------- */

  let caixaDica = null;

  function obterCaixa() {
    if (!caixaDica) {
      caixaDica = document.createElement('div');
      caixaDica.className = 'vz-dica';
      caixaDica.setAttribute('role', 'tooltip');
      caixaDica.hidden = true;
      document.body.appendChild(caixaDica);
    }
    return caixaDica;
  }

  function ativarTooltips(raiz) {
    function mostrar(alvo, evento) {
      const partes = alvo.getAttribute('data-tip').split(SEPARADOR_DA_DICA);
      const caixa = obterCaixa();
      caixa.innerHTML = '<strong>' + esc(partes[0]) + '</strong>' + partes.slice(1).map(function (p) { return '<span>' + esc(p) + '</span>'; }).join('');
      caixa.hidden = false;
      const largura = caixa.offsetWidth;
      const x = Math.min(evento.clientX + 14, window.innerWidth - largura - 8);
      caixa.style.left = Math.max(8, x) + 'px';
      caixa.style.top = evento.clientY + 16 + 'px';
    }
    raiz.addEventListener('mousemove', function (evento) {
      const alvo = evento.target.closest('[data-tip]');
      if (alvo && raiz.contains(alvo)) mostrar(alvo, evento);
      else if (caixaDica) caixaDica.hidden = true;
    });
    raiz.addEventListener('mouseleave', function () {
      if (caixaDica) caixaDica.hidden = true;
    });
  }

  App.graficos = {
    rotuloMes: rotuloMes,
    colunasAgrupadas: colunasAgrupadas,
    linha: linha,
    ranking: ranking,
    legenda: legenda,
    tabela: tabela,
    ativarTooltips: ativarTooltips,
  };
})();
