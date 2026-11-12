/* Troca de telas pelo endereço (index.html#entradas), sem recarregar a página.
   Recarregar faria o navegador pedir de novo a autorização da pasta.

   Cada tela se registra assim:
     App.roteador.registrar('entradas', {
       titulo: 'Entradas', icone: 'trending_up', menu: true,
       render: function (elemento) { ... }
     });
*/
(function () {
  'use strict';

  const rotas = {};
  let atual = null;

  // `ordem` define a posição no menu lateral, para não depender da ordem dos scripts.
  function registrar(nome, definicao) {
    rotas[nome] = definicao;
  }

  function nomesDoMenu() {
    return Object.keys(rotas)
      .filter(function (nome) {
        return rotas[nome].menu;
      })
      .sort(function (a, b) {
        return (rotas[a].ordem || 99) - (rotas[b].ordem || 99);
      });
  }

  function rotaDoEndereco() {
    const nome = decodeURIComponent(location.hash.replace(/^#/, ''));
    return rotas[nome] && nome !== 'conectar' ? nome : 'dashboard';
  }

  function aspas(valor) {
    return String(valor).replace(/["\\]/g, '\\$&');
  }

  // Identifica o elemento focado dentro da tela por nome de campo ou por ação do botão
  // (mais a posição entre os que casam, para telas com vários campos de mesmo nome).
  function descreverFoco(alvo) {
    const el = document.activeElement;
    if (!el || el === alvo || !alvo.contains(el)) return null;
    let chave = null;
    if (el.name) chave = '[name="' + aspas(el.name) + '"]';
    else if (el.dataset && el.dataset.acao) {
      chave = '[data-acao="' + aspas(el.dataset.acao) + '"]';
      if (el.dataset.id) chave += '[data-id="' + aspas(el.dataset.id) + '"]';
    }
    if (!chave) return null;
    const indice = Array.from(alvo.querySelectorAll(chave)).indexOf(el);
    return indice < 0 ? null : { chave: chave, indice: indice };
  }

  function restaurarFoco(alvo, foco) {
    const candidatos = alvo.querySelectorAll(foco.chave);
    const el = candidatos[Math.min(foco.indice, candidatos.length - 1)];
    if (el && !el.disabled && el.focus) el.focus({ preventScroll: true });
  }

  function renderizar() {
    const alvo = document.getElementById('conteudo');
    if (!alvo) return;

    if (!App.storage.carregado()) {
      document.body.classList.add('sem-conexao');
      atual = 'conectar';
      document.title = 'MeuFinanceiro';
      alvo.innerHTML = '';
      rotas.conectar.render(alvo);
      return;
    }

    document.body.classList.remove('sem-conexao');
    const nome = rotaDoEndereco();
    const mudouDeTela = nome !== atual;
    atual = nome;
    const definicao = rotas[nome];
    document.title = definicao.titulo + ' – MeuFinanceiro';
    App.eventos.emit('rota:alterada', { nome: nome, titulo: definicao.titulo });
    // Redesenhar recria os elementos; sem isto quem usa o teclado perderia o foco a cada mudança
    // (escolher outro item de um filtro, fechar uma janela...).
    const foco = mudouDeTela ? null : descreverFoco(alvo);
    // Cada tela substitui todo o conteúdo ao desenhar. Não limpamos antes: assim a tela ainda pode ler o
    // que está digitado no formulário atual, e, se o desenho falhar, a tela anterior fica em vez de em branco.
    definicao.render(alvo);
    if (foco) restaurarFoco(alvo, foco);
    if (mudouDeTela) {
      window.scrollTo(0, 0);
      alvo.focus({ preventScroll: true });
    }
  }

  function iniciar() {
    window.addEventListener('hashchange', renderizar);
    // Redesenha quando a conexão muda (conectou, deu erro) ou quando o mês muda.
    App.eventos.on('armazenamento:estado', function () {
      if (atual === 'conectar' || !App.storage.carregado() || atual === null) renderizar();
    });
    App.eventos.on('armazenamento:carregado', renderizar);
    App.eventos.on('mes:alterado', function () {
      if (atual !== 'conectar') renderizar();
    });
    renderizar();
  }

  App.roteador = {
    registrar: registrar,
    iniciar: iniciar,
    renderizar: renderizar,
    atual: function () {
      return atual;
    },
    menu: function () {
      return nomesDoMenu().map(function (nome) {
        return { nome: nome, titulo: rotas[nome].titulo, icone: rotas[nome].icone };
      });
    },
  };
})();
