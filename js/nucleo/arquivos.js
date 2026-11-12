/* Salvar e abrir arquivos escolhidos pelo usuário (backup manual, planilha, restauração).

   - Salvar: usa a janela "Salvar como" do Chrome/Edge (o usuário escolhe a pasta, inclusive fora da
     pasta de dados). Se ela não existir, baixa pelo navegador.
   - Abrir: o arquivo é lido na memória; nada é enviado para fora do computador. */
(function () {
  'use strict';

  // opcoes: { descricao, tipoMime, extensao }. Devolve { salvo, nome }; salvo = false se o usuário cancelou.
  async function salvar(conteudo, nomeSugerido, opcoes) {
    const blob = new Blob([conteudo], { type: opcoes.tipoMime });
    if (typeof window.showSaveFilePicker === 'function') {
      try {
        const tipos = {};
        tipos[opcoes.tipoMime] = [opcoes.extensao];
        const handle = await window.showSaveFilePicker({
          suggestedName: nomeSugerido,
          types: [{ description: opcoes.descricao, accept: tipos }],
        });
        const escrita = await handle.createWritable();
        await escrita.write(blob);
        await escrita.close();
        return { salvo: true, nome: handle.name };
      } catch (erro) {
        if (erro.name === 'AbortError') return { salvo: false, nome: '' };
        console.warn('A janela "Salvar como" falhou; baixando pelo navegador:', erro);
      }
    }
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = nomeSugerido;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () {
      URL.revokeObjectURL(link.href);
    }, 10000);
    return { salvo: true, nome: nomeSugerido };
  }

  function lerTexto(arquivo) {
    return arquivo.text();
  }

  App.arquivos = { salvar: salvar, lerTexto: lerTexto };
})();
