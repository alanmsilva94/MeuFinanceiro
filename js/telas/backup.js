/* Painéis de backup, restauração, exportação para Excel e impressão (RF-39 a RF-42),
   mostrados na tela Configurações. As ações são chamadas por configuracoes.js.

   - Backup automático: acontece sozinho (nucleo/backup.js); aqui se vê o estado e a lista de cópias.
   - Backup manual: exporta um arquivo único, para guardar fora da pasta de dados.
   - Restaurar: de uma cópia da pasta backups/ ou de um arquivo, sempre com confirmação. */
(function () {
  'use strict';

  const U = App.util;
  const F = App.formulario;
  const esc = U.escaparHtml;

  const ROTULOS_DE_ARQUIVO = {
    contas: 'contas', categorias: 'categorias', lancamentos: 'lançamentos', recorrencias: 'recorrências',
    cartoes: 'cartões', compras_cartao: 'compras no cartão', faturas: 'faturas', investimentos: 'investimentos',
  };

  function botaoTexto(acao, icone, texto, classe, dados) {
    const atributos = Object.keys(dados || {}).map(function (k) { return ' data-' + k + '="' + esc(dados[k]) + '"'; }).join('');
    return '<button type="button" class="botao ' + classe + '" data-acao="' + acao + '"' + atributos + '><span class="icone" aria-hidden="true">' + icone + '</span>' + esc(texto) + '</button>';
  }

  /* ---------- HTML ---------- */

  function html() {
    return (
      '<section class="painel" data-painel-backup><div class="painel__topo"><div><h2>Backup e restauração</h2>' +
      '<p class="texto-secundario">Depois das alterações, o programa guarda uma cópia de todos os dados na pasta <code>backups</code>, dentro da pasta de dados, ' +
      'no máximo uma a cada poucos minutos (o que mudar nesse intervalo entra na cópia seguinte). Ficam as cópias mais recentes e a última de cada um dos últimos 30 dias.</p></div></div>' +
      '<div data-status-backup class="texto-secundario" style="margin-bottom:var(--esp-3)"></div>' +
      '<div class="painel__acoes">' +
      botaoTexto('exportar-backup', 'download', 'Exportar backup (arquivo)', 'botao--primario') +
      botaoTexto('copia-agora', 'content_copy', 'Fazer cópia agora', 'botao--secundario') +
      botaoTexto('restaurar-arquivo', 'upload_file', 'Restaurar de um arquivo…', 'botao--secundario') +
      '<input type="file" accept=".json,application/json" hidden data-arquivo-backup></div>' +
      '<p class="nota-info" style="margin:var(--esp-4) 0">O backup exportado é um arquivo único com todos os seus dados. Guarde-o <strong>fora</strong> da pasta de dados ' +
      '(e fora do Google Drive), por exemplo num pen drive ou disco externo, para ter uma cópia que não depende dessa pasta.</p>' +
      '<div class="formulario__grade" style="max-width:480px">' +
      F.campo({ nome: 'copiasMantidas', rotulo: 'Cópias recentes mantidas', tipo: 'numero', valor: String(App.backup.copiasMantidas()), dica: 'Entre 1 e 500.' }) +
      F.campo({ nome: 'intervaloBackup', rotulo: 'Intervalo entre cópias (minutos)', tipo: 'numero', valor: String(App.backup.intervaloMinutos()), dica: 'Entre 1 e 240. Cópias idênticas à anterior não são gravadas.' }) +
      '</div>' +
      '<h3 style="margin:var(--esp-4) 0 var(--esp-2)">Cópias na pasta backups</h3><div data-lista-backups><p class="texto-fraco">Carregando…</p></div></section>' +

      '<section class="painel"><div class="painel__topo"><div><h2>Exportar para Excel</h2>' +
      '<p class="texto-secundario">Gera uma planilha (.xlsx) com abas de lançamentos, compras no cartão (e suas parcelas) e investimentos (resumo, movimentações e valores atuais). ' +
      'Os valores saem em reais e as datas como datas, para filtrar e somar no Excel.</p></div>' +
      botaoTexto('exportar-excel', 'table_view', 'Exportar planilha (.xlsx)', 'botao--primario') + '</div></section>' +

      '<section class="painel"><div class="painel__topo"><div><h2>Imprimir ou salvar como PDF</h2>' +
      '<p class="texto-secundario">Qualquer tela pode ser impressa pelo navegador, também pelo botão de impressora no topo. ' +
      'Na janela de impressão, escolha "Salvar como PDF" no destino. Menus e botões não saem na página.</p></div>' +
      botaoTexto('imprimir', 'print', 'Imprimir esta tela', 'botao--secundario') + '</div></section>'
    );
  }

  /* ---------- Estado e lista (preenchidos depois do desenho) ---------- */

  function rotuloDaCopia(c) {
    return U.formatarData(c.data) + ' às ' + c.hora;
  }

  function textoDoStatus() {
    const falha = App.backup.falha();
    if (falha) return '<span class="valor-negativo">O último backup automático falhou:</span> ' + esc(falha.message);
    const ultimo = App.backup.ultimo();
    if (ultimo) return 'Último backup automático nesta sessão: ' + esc(U.formatarData(ultimo.nome.slice(0, 10)) + ' às ' + ultimo.nome.slice(11, 16).replace('-', ':')) + '.';
    return 'O backup automático roda depois de cada alteração. Ainda não houve alteração nesta sessão.';
  }

  async function preencherLista(raiz) {
    const alvo = raiz.querySelector('[data-lista-backups]');
    let copias;
    try {
      copias = await App.backup.listar();
    } catch (erro) {
      if (alvo.isConnected) alvo.innerHTML = '<p class="texto-fraco">Não foi possível ler a pasta backups: ' + esc(erro.message) + '</p>';
      return;
    }
    if (!alvo.isConnected) return; // a tela já foi redesenhada
    if (!copias.length) {
      alvo.innerHTML = '<p class="vazio">Ainda não há cópias na pasta backups. Elas aparecem depois da próxima alteração, ou clique em "Fazer cópia agora".</p>';
      return;
    }
    alvo.innerHTML =
      '<div class="tabela-rolagem" style="max-height:320px;overflow:auto"><table class="tabela"><thead><tr><th>Data e hora</th><th>Tipo</th><th></th></tr></thead><tbody>' +
      copias.map(function (c) {
        return (
          '<tr><td>' + esc(rotuloDaCopia(c)) + '</td><td>' + (c.automatico ? 'Automática' : c.sufixo.indexOf(App.backup.SUFIXO_RESTAURAR) === 0 ? 'Antes de restaurar' : esc(c.sufixo)) + '</td>' +
          '<td class="tabela__acoes">' + botaoTexto('restaurar-copia', 'restore', 'Restaurar', 'botao--fantasma botao--pequeno', { nome: c.nome }) + '</td></tr>'
        );
      }).join('') + '</tbody></table></div>';
  }

  /* ---------- Restauração (RF-40) ---------- */

  function htmlDoResumo(conjunto) {
    const r = App.backup.resumo(conjunto);
    return '<ul class="texto-secundario">' + Object.keys(r).map(function (k) {
      return '<li>' + r[k] + ' ' + esc(ROTULOS_DE_ARQUIVO[k] || k) + '</li>';
    }).join('') + '</ul>';
  }

  // Mostra o que será restaurado e só troca os dados depois da confirmação.
  async function confirmarRestauracao(origem, conjunto, criadoEm) {
    const salvou = await App.modal.abrir({
      titulo: 'Restaurar backup',
      rotuloSalvar: 'Restaurar',
      perigo: true,
      corpo:
        '<p>Restaurar <strong>' + esc(origem) + '</strong>' + (criadoEm ? ' (criado em ' + esc(new Date(criadoEm).toLocaleString('pt-BR')) + ')' : '') + '?</p>' +
        '<p><strong>Todos os dados atuais serão substituídos</strong> pelos do backup, que tem:</p>' + htmlDoResumo(conjunto) +
        '<p class="texto-secundario">Antes de trocar, o estado atual é guardado na pasta backups com o nome "…_antes-de-restaurar". Se a cópia de segurança não puder ser gravada, nada é alterado.</p>',
      aoSalvar: async function () {
        const r = await App.backup.restaurar(conjunto);
        if (r.falhas.length) {
          App.aviso.alerta(
            'Os dados foram restaurados na tela, mas ' + r.falhas.join(', ') + ' não puderam ser gravados na pasta agora. ' +
              'Eles ficam pendentes e são gravados de novo assim que a pasta responder; não feche o programa até lá.'
          );
        } else {
          App.aviso.sucesso('Backup restaurado. O estado anterior ficou guardado em backups/' + r.copiaDeSeguranca + '.');
        }
        return true;
      },
    });
    if (salvou) App.eventos.emit('armazenamento:carregado'); // redesenha e gera de novo recorrências e faturas
    return false;
  }

  async function restaurarDeCopia(nome) {
    const conjunto = await App.backup.lerCopia(nome);
    const info = App.backup.interpretarNome(nome);
    return confirmarRestauracao('a cópia de ' + (info ? rotuloDaCopia(info) : nome), conjunto, null);
  }

  /* ---------- Ações ---------- */

  async function exportarBackup() {
    const unico = App.backup.arquivoUnico();
    const r = await App.arquivos.salvar(unico.texto, unico.nome, { descricao: 'Backup do MeuFinanceiro', tipoMime: 'application/json', extensao: '.json' });
    if (r.salvo) App.aviso.sucesso('Backup exportado: ' + r.nome + '. Guarde-o fora da pasta de dados.');
    return false;
  }

  async function copiaAgora() {
    const nome = await App.backup.criarCopia(undefined, true); // pedida pelo usuário: grava mesmo se nada mudou
    await App.backup.aplicarRetencao();
    App.aviso.sucesso('Cópia criada em backups/' + nome + '.');
    return false;
  }

  async function exportarExcel() {
    const bytes = await App.exportacao.gerarXlsx(); // comprime com DEFLATE (assíncrono)
    const r = await App.arquivos.salvar(bytes, App.exportacao.nomeDoArquivo(), {
      descricao: 'Planilha do Excel', tipoMime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extensao: '.xlsx',
    });
    if (r.salvo) App.aviso.sucesso('Planilha exportada: ' + r.nome + '.');
    return false;
  }

  function imprimir() {
    window.print();
    return false;
  }

  // Liga o que não é botão: o seletor de arquivo, o número de cópias e o preenchimento assíncrono.
  function ligar(raiz) {
    const status = raiz.querySelector('[data-status-backup]');
    if (!status) return;
    status.innerHTML = textoDoStatus();
    preencherLista(raiz);

    const entrada = raiz.querySelector('[data-arquivo-backup]');
    entrada.addEventListener('change', async function () {
      const arquivo = entrada.files[0];
      entrada.value = '';
      if (!arquivo) return;
      try {
        const lido = App.backup.lerArquivoUnico(await App.arquivos.lerTexto(arquivo));
        await confirmarRestauracao('o arquivo "' + arquivo.name + '"', lido.conjunto, lido.criadoEm);
      } catch (erro) {
        if (erro instanceof App.ErroValidacao) {
          App.aviso.alerta(erro.message);
        } else {
          console.error(erro);
          App.aviso.erro('Não foi possível abrir o arquivo: ' + erro.message);
        }
      }
    });

    // Preferências numéricas do backup: valida, grava em config.json e confirma.
    function ligarPreferencia(nomeDoCampo, chave, minimo, maximo, atual, mensagemInvalida, mensagemSalva) {
      const campo = raiz.querySelector('[name="' + nomeDoCampo + '"]');
      campo.addEventListener('change', async function () {
        const n = Number(campo.value);
        if (campo.value === '' || !Number.isInteger(n) || n < minimo || n > maximo) {
          App.aviso.alerta(mensagemInvalida);
          campo.value = String(atual());
          return;
        }
        const config = App.storage.obter('config');
        const nova = {};
        nova[chave] = n;
        config.preferencias = Object.assign({}, config.preferencias, nova);
        try {
          await App.storage.salvar('config');
          App.aviso.sucesso(mensagemSalva(n));
        } catch (erro) {
          /* o armazenamento já avisou */
        }
      });
    }
    ligarPreferencia('copiasMantidas', 'backupsMantidos', 1, 500, App.backup.copiasMantidas,
      'Informe um número inteiro de cópias, entre 1 e 500.', function (n) { return 'Preferência salva: ' + n + ' cópias recentes.'; });
    ligarPreferencia('intervaloBackup', 'backupIntervaloMinutos', 1, 240, App.backup.intervaloMinutos,
      'Informe um número inteiro de minutos, entre 1 e 240.', function (n) { return 'Preferência salva: uma cópia automática a cada ' + n + ' minuto(s), no máximo.'; });
  }

  function escolherArquivo() {
    const entrada = document.querySelector('[data-arquivo-backup]');
    if (entrada) entrada.click();
  }

  App.telas = App.telas || {};
  App.telas.backup = {
    html: html,
    ligar: ligar,
    exportarBackup: exportarBackup,
    copiaAgora: copiaAgora,
    exportarExcel: exportarExcel,
    imprimir: imprimir,
    escolherArquivo: escolherArquivo,
    restaurarDeCopia: restaurarDeCopia,
  };
})();
