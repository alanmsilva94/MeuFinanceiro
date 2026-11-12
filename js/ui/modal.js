/* Janelas sobre a tela: formulários e confirmações.

   App.modal.abrir({ titulo, corpo, rotuloSalvar, rotuloCancelar, perigo, aoSalvar })
     - corpo: HTML do conteúdo (já com texto escapado)
     - aoSalvar(form): função assíncrona chamada ao enviar. Se lançar App.ErroValidacao,
       a mensagem aparece na janela e ela continua aberta; sem erro, a janela fecha.
     - devolve uma Promise: true se foi salvo, false se foi cancelado (ou se aoSalvar devolveu false).

   App.modal.confirmar({ titulo, mensagem, rotuloConfirmar, perigo }) -> Promise<boolean> */
(function () {
  'use strict';

  const esc = function (t) {
    return App.util.escaparHtml(t);
  };
  let contador = 0;

  const FOCAVEIS = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])';

  function abrir(op) {
    return new Promise(function (resolver) {
      const focoAnterior = document.activeElement;
      const idTitulo = 'modal-titulo-' + ++contador;
      const fundo = document.createElement('div');
      fundo.className = 'modal';
      fundo.innerHTML =
        '<div class="modal__caixa" role="dialog" aria-modal="true" aria-labelledby="' + idTitulo + '">' +
        '<form class="modal__form" novalidate>' +
        '<header class="modal__topo"><h2 id="' + idTitulo + '">' + esc(op.titulo) + '</h2>' +
        '<button type="button" class="botao-icone botao-icone--plano" data-fechar aria-label="Fechar">' +
        '<span class="icone" aria-hidden="true">close</span></button></header>' +
        '<div class="modal__corpo">' + op.corpo + '<p class="formulario__erro" role="alert" hidden></p></div>' +
        '<footer class="modal__rodape">' +
        '<button type="button" class="botao botao--fantasma" data-fechar>' + esc(op.rotuloCancelar || 'Cancelar') + '</button>' +
        '<button type="submit" class="botao ' + (op.perigo ? 'botao--perigo' : 'botao--primario') + '">' +
        esc(op.rotuloSalvar || 'Salvar') + '</button>' +
        '</footer></form></div>';

      const form = fundo.querySelector('form');
      const erro = fundo.querySelector('.formulario__erro');
      const botaoSalvar = fundo.querySelector('[type="submit"]');
      let ocupado = false;
      let pressionouNoFundo = false;

      function fechar(salvo) {
        document.removeEventListener('keydown', aoTeclar, true);
        fundo.remove();
        if (!document.querySelector('.modal')) document.body.style.overflow = '';
        if (focoAnterior && focoAnterior.isConnected && focoAnterior.focus) focoAnterior.focus();
        resolver(salvo);
      }

      function mostrarErro(mensagem) {
        erro.textContent = mensagem;
        erro.hidden = false;
      }

      function aoTeclar(evento) {
        if (evento.key === 'Escape' && !ocupado) {
          evento.preventDefault();
          fechar(false);
        } else if (evento.key === 'Tab') {
          const itens = Array.from(fundo.querySelectorAll(FOCAVEIS));
          if (!itens.length) return;
          const primeiro = itens[0];
          const ultimo = itens[itens.length - 1];
          if (evento.shiftKey && document.activeElement === primeiro) {
            evento.preventDefault();
            ultimo.focus();
          } else if (!evento.shiftKey && document.activeElement === ultimo) {
            evento.preventDefault();
            primeiro.focus();
          }
        }
      }

      fundo.addEventListener('mousedown', function (evento) {
        pressionouNoFundo = evento.target === fundo;
      });
      fundo.addEventListener('click', function (evento) {
        if (evento.target === fundo && pressionouNoFundo && !ocupado) fechar(false);
      });
      fundo.querySelectorAll('[data-fechar]').forEach(function (botao) {
        botao.addEventListener('click', function () {
          if (!ocupado) fechar(false);
        });
      });

      form.addEventListener('submit', async function (evento) {
        evento.preventDefault();
        if (ocupado) return;
        ocupado = true;
        botaoSalvar.disabled = true;
        erro.hidden = true;
        try {
          // Se aoSalvar devolver false (gravação na pasta falhou), a janela fecha mas conta como "não salvo".
          const resultado = op.aoSalvar ? await op.aoSalvar(form) : true;
          ocupado = false;
          fechar(resultado !== false);
        } catch (e) {
          ocupado = false;
          botaoSalvar.disabled = false;
          if (e instanceof App.ErroValidacao) {
            mostrarErro(e.message);
          } else {
            console.error(e);
            mostrarErro('Algo deu errado: ' + e.message);
          }
        }
      });

      document.addEventListener('keydown', aoTeclar, true);
      document.body.style.overflow = 'hidden';
      document.body.appendChild(fundo);
      const primeiroCampo = fundo.querySelector('input:not([type="hidden"]), select, textarea') || botaoSalvar;
      primeiroCampo.focus();
    });
  }

  function confirmar(op) {
    return abrir({
      titulo: op.titulo,
      corpo: '<p>' + esc(op.mensagem) + '</p>',
      rotuloSalvar: op.rotuloConfirmar || 'Confirmar',
      perigo: op.perigo,
    });
  }

  App.modal = { abrir: abrir, confirmar: confirmar };
})();
