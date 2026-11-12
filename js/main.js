/* Inicialização: monta o menu e o cabeçalho e liga o roteador e o armazenamento.
   Carregado por último. */
(function () {
  'use strict';

  const U = App.util;

  /* ---------- Menu ---------- */

  function montarMenu() {
    const nav = document.getElementById('menu-navegacao');
    nav.innerHTML = App.roteador
      .menu()
      .map(function (item) {
        return (
          '<a class="menu__item" href="#' + item.nome + '" data-rota="' + item.nome + '" title="' + item.titulo + '" aria-label="' + item.titulo + '">' +
          '<span class="icone" aria-hidden="true">' + item.icone + '</span>' +
          '<span>' + item.titulo + '</span></a>'
        );
      })
      .join('');
    document.getElementById('versao').textContent = 'Versão ' + App.versao;
  }

  App.eventos.on('rota:alterada', function (rota) {
    document.querySelectorAll('.menu__item').forEach(function (link) {
      if (link.dataset.rota === rota.nome) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    document.getElementById('titulo-tela').textContent = rota.titulo;
  });

  /* ---------- Seletor de mês ---------- */

  function atualizarMes() {
    document.getElementById('mes-nome').textContent = U.nomeMes(App.estado.mes);
  }

  function mudarMes(novo) {
    App.estado.mes = novo;
    atualizarMes();
    App.eventos.emit('mes:alterado', novo);
  }

  function ligarSeletorMes() {
    App.estado.mes = U.mesAtual();
    atualizarMes();
    document.getElementById('mes-anterior').addEventListener('click', function () {
      mudarMes(U.somarMeses(App.estado.mes, -1));
    });
    document.getElementById('mes-seguinte').addEventListener('click', function () {
      mudarMes(U.somarMeses(App.estado.mes, 1));
    });
    document.getElementById('mes-nome').addEventListener('click', function () {
      if (App.estado.mes !== U.mesAtual()) mudarMes(U.mesAtual());
    });
  }

  /* ---------- Tema claro/escuro ---------- */

  function temaEfetivo() {
    const definido = document.documentElement.dataset.theme;
    if (definido) return definido;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function atualizarBotaoTema() {
    const escuro = temaEfetivo() === 'dark';
    const botao = document.getElementById('botao-tema');
    botao.querySelector('.icone').textContent = escuro ? 'light_mode' : 'dark_mode';
    botao.setAttribute('aria-label', escuro ? 'Usar tema claro' : 'Usar tema escuro');
    botao.title = botao.getAttribute('aria-label');
  }

  function ligarTema() {
    atualizarBotaoTema();
    document.getElementById('botao-tema').addEventListener('click', function () {
      const novo = temaEfetivo() === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = novo;
      try {
        localStorage.setItem('mf-tema', novo);
      } catch (e) {
        /* sem armazenamento local: o tema vale só até fechar */
      }
      atualizarBotaoTema();
    });
  }

  /* ---------- Indicador de estado dos dados ---------- */

  function atualizarEstadoDados() {
    const info = App.storage.estado();
    const botao = document.getElementById('estado-dados');
    const texto = botao.querySelector('[data-texto]');
    let estado = info.estado;
    let rotulo = '';
    let dica = '';

    if (estado === 'conectado') {
      rotulo = 'Dados salvos em ' + info.pasta;
      dica = 'Pasta de dados conectada. Cada alteração é gravada na hora.';
    } else if (estado === 'atencao') {
      rotulo = 'Atenção: cópias em conflito';
      dica = 'Clique para ver as cópias de arquivos encontradas na pasta de dados.';
    } else if (estado === 'falha-gravacao') {
      rotulo = 'Não salvo: pasta sem resposta';
      dica = 'A pasta de dados não respondeu. As alterações estão guardadas nesta página. Clique para tentar gravar de novo.';
    } else if (estado === 'sem-permissao') {
      rotulo = 'Reautorizar pasta';
      dica = 'O navegador retirou a permissão de gravação. Clique para autorizar de novo.';
    } else {
      estado = 'outro';
      rotulo = 'Dados desconectados';
    }

    botao.dataset.estado = estado;
    texto.textContent = rotulo;
    botao.title = dica;
  }

  function ligarEstadoDados() {
    const botao = document.getElementById('estado-dados');
    botao.addEventListener('click', async function () {
      const estado = botao.dataset.estado;
      if (estado === 'sem-permissao') {
        await App.storage.reautorizar();
      } else if (estado === 'falha-gravacao') {
        await App.storage.tentarPendentes(false);
      } else if (estado === 'atencao') {
        const duplicados = await App.storage.procurarDuplicados();
        if (duplicados.length) {
          App.aviso.alerta(
            'Cópias em conflito na pasta de dados: ' + duplicados.join(', ') +
              '. O MeuFinanceiro usa só os arquivos sem número. Confira as cópias e apague-as quando não precisar mais delas.'
          );
        } else {
          App.aviso.sucesso('As cópias em conflito foram resolvidas.');
        }
      }
    });
    App.eventos.on('armazenamento:estado', atualizarEstadoDados);
    atualizarEstadoDados();
  }

  /* ---------- Recorrências: geração ao abrir (RF-14) ---------- */

  App.eventos.on('armazenamento:carregado', async function () {
    try {
      const r = await App.recorrencias.gerarPendentes();
      if (r.geradas > 0 && r.salvo) {
        App.aviso.info(r.geradas + ' lançamento(s) recorrente(s) gerado(s) como pendente(s).');
      }
      if (r.puladas > 0) {
        App.aviso.alerta(
          r.puladas + ' recorrência(s) não geraram lançamentos porque a conta está inativa. Reative a conta ou pause a recorrência em Configurações.'
        );
      }
      if (r.geradas > 0) App.roteador.renderizar();
    } catch (erro) {
      console.error(erro);
      App.aviso.erro('Não foi possível gerar os lançamentos recorrentes: ' + erro.message);
    }
  });

  /* ---------- Cartões: faturas automáticas (RF-19) ---------- */

  App.eventos.on('armazenamento:carregado', async function () {
    try {
      await App.faturas.gerarFaturas();
      App.roteador.renderizar();
    } catch (erro) {
      console.error(erro);
      App.aviso.erro('Não foi possível gerar as faturas dos cartões: ' + erro.message);
    }
  });

  /* ---------- Backup automático (RF-39) ---------- */

  App.backup.iniciarAutomatico();

  // Uma falha de backup nunca atrapalha a gravação dos dados; só avisa, no máximo a cada meia hora.
  let ultimoAvisoDeBackup = 0;
  App.eventos.on('backup:falha', function (erro) {
    if (Date.now() - ultimoAvisoDeBackup < 30 * 60 * 1000) return;
    ultimoAvisoDeBackup = Date.now();
    App.aviso.alerta(
      'Não foi possível gravar o backup automático: ' + erro.message + ' Seus dados continuam salvos, mas sem cópia nova.'
    );
  });

  /* ---------- Impressão (RF-42) ---------- */

  window.addEventListener('beforeprint', function () {
    document.getElementById('cabecalho-impressao').textContent =
      'MeuFinanceiro · ' + document.getElementById('titulo-tela').textContent + ' · impresso em ' + U.formatarData(U.hojeISO());
    // Abre a visão em tabela de cada gráfico, para os valores saírem no papel.
    document.querySelectorAll('details.vz-tabela').forEach(function (d) {
      d.dataset.estavaAberta = d.open ? '1' : '';
      d.open = true;
    });
  });

  window.addEventListener('afterprint', function () {
    document.querySelectorAll('details.vz-tabela').forEach(function (d) {
      d.open = d.dataset.estavaAberta === '1';
    });
  });

  document.getElementById('botao-imprimir').addEventListener('click', function () {
    window.print();
  });

  /* ---------- Início ---------- */

  document.addEventListener('DOMContentLoaded', function () {
    montarMenu();
    ligarSeletorMes();
    ligarTema();
    ligarEstadoDados();
    App.roteador.iniciar();
    App.storage.iniciar().catch(function (erro) {
      console.error(erro);
      App.aviso.erro('Falha ao iniciar: ' + erro.message);
    });
  });
})();
