/* Gerador de planilhas .xlsx, sem bibliotecas (funciona offline).

   Um .xlsx é um arquivo ZIP com alguns XMLs. Este módulo monta o ZIP e escreve só o que a
   exportação precisa: texto, números, datas, valores em reais e percentuais, cabeçalho em
   negrito e primeira linha congelada.

   Compressão: cada arquivo é comprimido com DEFLATE usando o CompressionStream do próprio navegador
   (o XML encolhe cerca de 10 vezes). Se o navegador não tiver essa API, os arquivos vão sem
   compressão (método "armazenado"), que também é válido para Excel, LibreOffice e Google Planilhas.

   Uso: await App.xlsx.criar([{ nome, colunas: [{ titulo, tipo, largura }], linhas: [[...], ...] }]) -> Uint8Array
   (segundo argumento opcional: { comprimir: false } força o método armazenado)
   Tipos de coluna: texto (padrão), moeda (centavos inteiros), data ("AAAA-MM-DD"), percentual (fração), numero. */
(function () {
  'use strict';

  const codificador = new TextEncoder();

  /* ---------- ZIP ---------- */

  const TABELA_CRC = (function () {
    const tabela = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      tabela[n] = c >>> 0;
    }
    return tabela;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = TABELA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function juntar(partes) {
    const total = partes.reduce(function (t, p) { return t + p.length; }, 0);
    const saida = new Uint8Array(total);
    let posicao = 0;
    partes.forEach(function (p) {
      saida.set(p, posicao);
      posicao += p.length;
    });
    return saida;
  }

  // Comprime com DEFLATE "cru" (o formato que o ZIP usa). Devolve null se o navegador não souber.
  async function comprimir(bytes) {
    if (typeof CompressionStream !== 'function') return null;
    const fluxo = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(fluxo).arrayBuffer());
  }

  // arquivos: [{ nome, conteudo: texto ou bytes }] -> o mesmo, já com o CRC, o método e os bytes que vão no ZIP.
  async function prepararArquivos(arquivos, usarCompressao) {
    const preparados = [];
    for (const a of arquivos) {
      const original = typeof a.conteudo === 'string' ? codificador.encode(a.conteudo) : a.conteudo;
      let guardado = original;
      let metodo = 0; // 0 = armazenado, 8 = DEFLATE
      if (usarCompressao) {
        const comprimido = await comprimir(original);
        if (comprimido && comprimido.length < original.length) {
          guardado = comprimido;
          metodo = 8;
        }
      }
      preparados.push({ nome: a.nome, crc: crc32(original), tamanhoOriginal: original.length, guardado: guardado, metodo: metodo });
    }
    return preparados;
  }

  // arquivos: saída de prepararArquivos.
  function zip(arquivos, agora) {
    const d = agora || new Date();
    const hora = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const data = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const locais = [];
    const central = [];
    let deslocamento = 0;

    arquivos.forEach(function (a) {
      const nome = codificador.encode(a.nome);
      const dados = a.guardado; // os bytes como vão no arquivo (comprimidos ou não)
      const crc = a.crc; // o CRC e o tamanho são sempre os do conteúdo original

      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true); // versão necessária
      local.setUint16(6, 0x0800, true); // nomes em UTF-8
      local.setUint16(8, a.metodo, true); // método: 0 armazenado, 8 DEFLATE
      local.setUint16(10, hora, true);
      local.setUint16(12, data, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, dados.length, true);
      local.setUint32(22, a.tamanhoOriginal, true);
      local.setUint16(26, nome.length, true);
      local.setUint16(28, 0, true);
      locais.push(new Uint8Array(local.buffer), nome, dados);

      const entrada = new DataView(new ArrayBuffer(46));
      entrada.setUint32(0, 0x02014b50, true);
      entrada.setUint16(4, 20, true);
      entrada.setUint16(6, 20, true);
      entrada.setUint16(8, 0x0800, true);
      entrada.setUint16(10, a.metodo, true);
      entrada.setUint16(12, hora, true);
      entrada.setUint16(14, data, true);
      entrada.setUint32(16, crc, true);
      entrada.setUint32(20, dados.length, true);
      entrada.setUint32(24, a.tamanhoOriginal, true);
      entrada.setUint16(28, nome.length, true);
      entrada.setUint32(42, deslocamento, true);
      central.push(new Uint8Array(entrada.buffer), nome);

      deslocamento += 30 + nome.length + dados.length;
    });

    const tamanhoCentral = central.reduce(function (t, p) { return t + p.length; }, 0);
    const fim = new DataView(new ArrayBuffer(22));
    fim.setUint32(0, 0x06054b50, true);
    fim.setUint16(8, arquivos.length, true);
    fim.setUint16(10, arquivos.length, true);
    fim.setUint32(12, tamanhoCentral, true);
    fim.setUint32(16, deslocamento, true);
    return juntar(locais.concat(central, [new Uint8Array(fim.buffer)]));
  }

  /* ---------- XML da planilha ---------- */

  const NS_PLANILHA = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const NS_RELACOES = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const NS_PACOTE = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const CABECALHO_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

  // Estilos (índices em cellXfs): 0 padrão, 1 cabeçalho, 2 data, 3 moeda, 4 percentual.
  const ESTILO = { texto: 0, cabecalho: 1, data: 2, moeda: 3, percentual: 4, numero: 0 };

  const STYLES_XML =
    CABECALHO_XML +
    '<styleSheet xmlns="' + NS_PLANILHA + '">' +
    '<numFmts count="2"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/>' +
    '<numFmt numFmtId="165" formatCode="&quot;R$&quot; #,##0.00;[Red]-&quot;R$&quot; #,##0.00"/></numFmts>' +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
    '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFE5EEFF"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
    '<border><left/><right/><top/><bottom style="thin"><color auto="1"/></bottom><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="5">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' +
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

  function escaparXml(texto) {
    return String(texto)
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '') // caracteres que o XML não aceita
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // 0 -> "A", 25 -> "Z", 26 -> "AA"
  function letrasDaColuna(indice) {
    let n = indice + 1;
    let letras = '';
    while (n > 0) {
      const resto = (n - 1) % 26;
      letras = String.fromCharCode(65 + resto) + letras;
      n = Math.floor((n - 1) / 26);
    }
    return letras;
  }

  // "2026-11-10" -> número de série do Excel (dias desde 30/12/1899)
  function serieDaData(iso) {
    const [a, m, d] = iso.split('-').map(Number);
    return Math.round((Date.UTC(a, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);
  }

  function celula(referencia, valor, tipo) {
    if (valor === null || valor === undefined || valor === '') return '';
    if (tipo === 'moeda') return '<c r="' + referencia + '" s="' + ESTILO.moeda + '"><v>' + (Math.round(valor) / 100).toFixed(2) + '</v></c>';
    if (tipo === 'percentual') return '<c r="' + referencia + '" s="' + ESTILO.percentual + '"><v>' + Number(valor) + '</v></c>';
    if (tipo === 'numero') return '<c r="' + referencia + '"><v>' + Number(valor) + '</v></c>';
    if (tipo === 'data' && /^\d{4}-\d{2}-\d{2}$/.test(valor)) return '<c r="' + referencia + '" s="' + ESTILO.data + '"><v>' + serieDaData(valor) + '</v></c>';
    return '<c r="' + referencia + '" t="inlineStr"><is><t xml:space="preserve">' + escaparXml(valor) + '</t></is></c>';
  }

  function larguraDaColuna(coluna, linhas, indice) {
    if (coluna.largura) return coluna.largura;
    const padrao = { moeda: 16, data: 13, percentual: 12, numero: 12 }[coluna.tipo];
    if (padrao) return Math.max(padrao, Math.min(coluna.titulo.length + 3, 40));
    let maior = coluna.titulo.length;
    linhas.forEach(function (l) {
      const v = l[indice];
      if (v !== null && v !== undefined) maior = Math.max(maior, String(v).length);
    });
    return Math.max(10, Math.min(maior + 2, 60));
  }

  function xmlDaPlanilha(planilha) {
    const colunas = planilha.colunas;
    let cabecalho = '<row r="1">';
    colunas.forEach(function (c, i) {
      cabecalho += '<c r="' + letrasDaColuna(i) + '1" s="' + ESTILO.cabecalho + '" t="inlineStr"><is><t xml:space="preserve">' + escaparXml(c.titulo) + '</t></is></c>';
    });
    cabecalho += '</row>';

    const linhas = planilha.linhas.map(function (linha, n) {
      const numero = n + 2;
      let xml = '<row r="' + numero + '">';
      colunas.forEach(function (c, i) {
        xml += celula(letrasDaColuna(i) + numero, linha[i], c.tipo || 'texto');
      });
      return xml + '</row>';
    }).join('');

    const larguras = colunas.map(function (c, i) {
      return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + larguraDaColuna(c, planilha.linhas, i) + '" customWidth="1"/>';
    }).join('');

    return (
      CABECALHO_XML + '<worksheet xmlns="' + NS_PLANILHA + '"><sheetViews><sheetView workbookViewId="0">' +
      '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft"/></sheetView></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="15"/><cols>' + larguras + '</cols><sheetData>' + cabecalho + linhas + '</sheetData></worksheet>'
    );
  }

  // O Excel limita o nome da aba a 31 caracteres e proíbe : \ / ? * [ ]. Nomes repetidos recebem número.
  function nomesDeAbas(planilhas) {
    const usados = new Set();
    return planilhas.map(function (p, i) {
      let nome = String(p.nome || 'Planilha ' + (i + 1)).replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 31) || 'Planilha ' + (i + 1);
      let tentativa = nome;
      let n = 2;
      while (usados.has(tentativa.toLowerCase())) {
        const sufixo = ' (' + n++ + ')';
        tentativa = nome.slice(0, 31 - sufixo.length) + sufixo;
      }
      usados.add(tentativa.toLowerCase());
      return tentativa;
    });
  }

  // Monta o arquivo .xlsx. Devolve os bytes (comprimidos, se o navegador permitir).
  async function criar(planilhas, opcoes) {
    if (!planilhas.length) throw new Error('A planilha precisa ter ao menos uma aba.');
    const nomes = nomesDeAbas(planilhas);
    const n = planilhas.length;

    let tipos =
      CABECALHO_XML + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>';
    let abas = '';
    let relacoes = '';
    for (let i = 1; i <= n; i++) {
      tipos += '<Override PartName="/xl/worksheets/sheet' + i + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
      abas += '<sheet name="' + escaparXml(nomes[i - 1]) + '" sheetId="' + i + '" r:id="rId' + i + '"/>';
      relacoes += '<Relationship Id="rId' + i + '" Type="' + NS_RELACOES + '/worksheet" Target="worksheets/sheet' + i + '.xml"/>';
    }
    tipos += '</Types>';
    relacoes += '<Relationship Id="rId' + (n + 1) + '" Type="' + NS_RELACOES + '/styles" Target="styles.xml"/>';

    const arquivos = [
      { nome: '[Content_Types].xml', conteudo: tipos },
      {
        nome: '_rels/.rels',
        conteudo: CABECALHO_XML + '<Relationships xmlns="' + NS_PACOTE + '"><Relationship Id="rId1" Type="' + NS_RELACOES + '/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      },
      {
        nome: 'xl/workbook.xml',
        conteudo: CABECALHO_XML + '<workbook xmlns="' + NS_PLANILHA + '" xmlns:r="' + NS_RELACOES + '"><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="20000" windowHeight="12000"/></bookViews><sheets>' + abas + '</sheets></workbook>',
      },
      { nome: 'xl/_rels/workbook.xml.rels', conteudo: CABECALHO_XML + '<Relationships xmlns="' + NS_PACOTE + '">' + relacoes + '</Relationships>' },
      { nome: 'xl/styles.xml', conteudo: STYLES_XML },
    ];
    planilhas.forEach(function (p, i) {
      arquivos.push({ nome: 'xl/worksheets/sheet' + (i + 1) + '.xml', conteudo: xmlDaPlanilha(p) });
    });
    const comCompressao = !(opcoes && opcoes.comprimir === false);
    return zip(await prepararArquivos(arquivos, comCompressao));
  }

  App.xlsx = {
    criar: criar,
    crc32: crc32,
    letrasDaColuna: letrasDaColuna,
    serieDaData: serieDaData,
    nomesDeAbas: nomesDeAbas,
  };
})();
