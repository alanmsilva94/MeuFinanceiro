/* Tela de conexão: aparece sempre que os dados ainda não foram carregados. */
(function () {
  'use strict';

  const esc = function (t) {
    return App.util.escaparHtml(t);
  };

  const PASSOS_PASTA =
    '<ol class="conectar__passos">' +
    '<li><strong>Crie a pasta na rede</strong><p>No computador ou servidor compartilhado, crie uma pasta só para os dados, por exemplo MeuFinanceiro-dados, e confira se você tem permissão de gravação nela.</p></li>' +
    '<li><strong>Mapeie como unidade</strong><p>Recomendado: no Explorador de Arquivos, use "Mapear unidade de rede" e marque "Reconectar ao entrar". Assim a pasta aparece com uma letra, como Z:.</p></li>' +
    '<li><strong>Conecte a pasta</strong><p>Clique em "Escolher pasta de dados", selecione a pasta criada e permita a edição quando o navegador perguntar.</p></li>' +
    '</ol>';

  const NOTA_PRIVACIDADE =
    '<div class="conectar__nota">' +
    '<span class="icone icone--preenchido" aria-hidden="true">lock</span>' +
    '<div><strong>Seus dados ficam com você</strong>' +
    'O MeuFinanceiro não envia nada pela internet. Ele lê e grava arquivos JSON na pasta que você escolher, seja no próprio computador ou numa pasta da sua rede.</div>' +
    '</div>';

  function boasVindas(titulo, texto, icone) {
    return (
      '<div class="conectar__boas-vindas">' +
      '<div class="conectar__simbolo"><span class="icone" aria-hidden="true">' + (icone || 'account_balance_wallet') + '</span></div>' +
      '<h1>' + titulo + '</h1>' +
      '<p>' + texto + '</p>' +
      '</div>'
    );
  }

  function montar(elemento, html) {
    elemento.innerHTML = '<div class="conectar"><div class="conectar__caixa">' + html + '</div></div>';
  }

  function ligar(elemento, seletor, acao) {
    const botao = elemento.querySelector(seletor);
    if (!botao) return;
    botao.addEventListener('click', async function () {
      botao.disabled = true;
      try {
        await acao();
      } catch (erro) {
        console.error(erro);
        App.aviso.erro('Algo deu errado: ' + erro.message);
      } finally {
        if (botao.isConnected) botao.disabled = false;
      }
    });
  }

  function render(elemento) {
    const info = App.storage.estado();

    if (info.estado === 'iniciando' || info.estado === 'carregando') {
      montar(
        elemento,
        '<div class="carregando"><span class="icone" aria-hidden="true">progress_activity</span>' +
          (info.estado === 'carregando' ? 'Lendo os dados de ' + esc(info.pasta) + '…' : 'Abrindo o MeuFinanceiro…') +
          '</div>'
      );
      return;
    }

    if (info.estado === 'sem-suporte') {
      montar(
        elemento,
        boasVindas(
          'Use o Chrome ou o Edge',
          'Este navegador não permite que páginas salvem arquivos numa pasta do computador, e o MeuFinanceiro depende disso para guardar seus dados. Abra o index.html no Google Chrome ou no Microsoft Edge.',
          'block'
        )
      );
      return;
    }

    if (info.estado === 'outra-aba') {
      montar(
        elemento,
        boasVindas(
          'O MeuFinanceiro já está aberto em outra aba',
          'Para evitar que uma aba apague as alterações da outra, só uma pode ficar aberta por vez. Feche a outra aba ou janela e clique em "Tentar de novo".',
          'tab'
        ) +
          '<div style="text-align:center"><button type="button" class="botao botao--primario botao--grande" data-acao="tentar">' +
          '<span class="icone" aria-hidden="true">refresh</span>Tentar de novo</button></div>'
      );
      ligar(elemento, '[data-acao="tentar"]', App.storage.iniciar);
      return;
    }

    if (info.estado === 'aguardando') {
      montar(
        elemento,
        boasVindas(
          'Bem-vindo de volta',
          'Por segurança, o navegador pede sua autorização a cada vez que o MeuFinanceiro é aberto.',
          'folder_open'
        ) +
          '<div class="painel">' +
          '<div class="conectar__acao">' +
          '<p>Pasta de dados: <strong>' + esc(info.pasta) + '</strong></p>' +
          '<button type="button" class="botao botao--primario botao--grande" data-acao="reautorizar">' +
          '<span class="icone" aria-hidden="true">lock_open</span>Continuar com esta pasta</button>' +
          '</div>' +
          '<div class="conectar__acoes-extras" style="margin-top:12px">' +
          '<button type="button" class="botao botao--fantasma" data-acao="escolher">' +
          '<span class="icone" aria-hidden="true">drive_folder_upload</span>Usar outra pasta</button>' +
          '</div>' +
          '</div>'
      );
      ligar(elemento, '[data-acao="reautorizar"]', App.storage.reautorizar);
      ligar(elemento, '[data-acao="escolher"]', App.storage.escolherPasta);
      return;
    }

    if (info.estado === 'em-uso') {
      const sinal = info.detalhe ? new Date(info.detalhe).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
      montar(
        elemento,
        boasVindas(
          'Os dados parecem estar abertos em outro computador',
          'A pasta ' + esc(info.pasta) + ' registrou atividade de outra sessão' + (sinal ? ' às ' + sinal : '') +
            '. Se dois computadores editarem ao mesmo tempo, um pode apagar as alterações do outro.',
          'devices'
        ) +
          '<div class="painel">' +
          '<p class="texto-secundario">Feche o MeuFinanceiro no outro computador e clique em "Tentar de novo". Se o outro computador foi desligado sem fechar a aplicação, a trava expira sozinha em até 3 minutos, ou você pode abrir mesmo assim.</p>' +
          '<div class="conectar__acoes-extras" style="margin-top:16px">' +
          '<button type="button" class="botao botao--primario" data-acao="reautorizar">' +
          '<span class="icone" aria-hidden="true">refresh</span>Tentar de novo</button>' +
          '<button type="button" class="botao botao--secundario" data-acao="forcar">' +
          '<span class="icone" aria-hidden="true">lock_open</span>Abrir mesmo assim</button>' +
          '</div></div>'
      );
      ligar(elemento, '[data-acao="reautorizar"]', App.storage.reautorizar);
      ligar(elemento, '[data-acao="forcar"]', App.storage.abrirMesmoAssim);
      return;
    }

    if (info.estado === 'erro') {
      montar(
        elemento,
        boasVindas('Não foi possível abrir seus dados', 'Nenhum arquivo foi alterado.', 'folder_off') +
          '<div class="painel">' +
          '<div class="conectar__problema"><span class="icone" aria-hidden="true">error</span><p>' + esc(info.detalhe) + '</p></div>' +
          '<div class="conectar__acoes-extras" style="margin-top:16px">' +
          '<button type="button" class="botao botao--primario" data-acao="reautorizar">' +
          '<span class="icone" aria-hidden="true">refresh</span>Tentar de novo</button>' +
          '<button type="button" class="botao botao--secundario" data-acao="escolher">' +
          '<span class="icone" aria-hidden="true">drive_folder_upload</span>Escolher outra pasta</button>' +
          '</div>' +
          '</div>'
      );
      ligar(elemento, '[data-acao="reautorizar"]', App.storage.reautorizar);
      ligar(elemento, '[data-acao="escolher"]', App.storage.escolherPasta);
      return;
    }

    // sem-pasta: primeira execução
    montar(
      elemento,
      boasVindas(
        'Bem-vindo ao MeuFinanceiro',
        'Para começar, escolha a pasta onde seus dados financeiros serão guardados. Pode ser uma pasta deste computador ou uma pasta compartilhada na sua rede.'
      ) +
        '<div class="painel">' +
        '<div class="conectar__acao">' +
        '<p>Nenhuma pasta conectada ainda.</p>' +
        '<button type="button" class="botao botao--primario botao--grande" data-acao="escolher">' +
        '<span class="icone" aria-hidden="true">folder_open</span>Escolher pasta de dados</button>' +
        '</div>' +
        '<h3 style="margin:24px 0 12px">Como preparar a pasta na rede</h3>' +
        PASSOS_PASTA +
        '</div>' +
        NOTA_PRIVACIDADE
    );
    ligar(elemento, '[data-acao="escolher"]', App.storage.escolherPasta);
  }

  App.roteador.registrar('conectar', { titulo: 'Conectar pasta', render: render });
})();
