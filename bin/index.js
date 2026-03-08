import express from 'express';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

// Ativa o modo furtivo para evitar bloqueios da Receita
puppeteer.use(StealthPlugin());

const app = express();
app.use(express.json()); // Permite receber o CNPJ do n8n em formato JSON

app.post('/gerar-das', async (req, res) => {
    const { cnpj } = req.body;

    if (!cnpj) {
        return res.status(400).json({ sucesso: false, erro: 'CNPJ não informado.' });
    }

    console.log(`Iniciando geração de DAS para o CNPJ: ${cnpj}`);
    let browser;

    try {
        // Configuração vital para rodar no EasyPanel/Docker sem quebrar
        browser = await puppeteer.launch({
            headless: true,
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH, 
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ]
        });

        const page = await browser.newPage();

        // ====================================================================
        // AQUI ENTRA A LÓGICA DE NAVEGAÇÃO DO SCRIPT ORIGINAL
        // Você vai colar os comandos que entram no site da receita, preenchem 
        // o CNPJ, clicam nos botões e geram o PDF.
        // ====================================================================

        // Exemplo de como a resposta final deve voltar para o seu n8n:
        const linkBoleto = "LINK_EXTRAIDO_AQUI"; 
        
        await browser.close();

        return res.status(200).json({
            sucesso: true,
            cnpj: cnpj,
            link_pdf: linkBoleto
        });

    } catch (error) {
        console.error("Erro no processamento:", error);
        if (browser) await browser.close();
        return res.status(500).json({ sucesso: false, erro: error.message });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 API do Robô PGMEI rodando na porta ${PORT}`);
});
