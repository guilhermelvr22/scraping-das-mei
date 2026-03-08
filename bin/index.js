import express from 'express';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

// Ativa o modo furtivo para evitar bloqueios do site da Receita
puppeteer.use(StealthPlugin());

const app = express();
app.use(express.json()); // Permite receber o CNPJ do n8n em formato JSON

app.post('/gerar-das', async (req, res) => {
    const { cnpj } = req.body;

    if (!cnpj) {
        return res.status(400).json({ sucesso: false, erro: 'CNPJ não informado.' });
    }

    console.log(`[${cnpj}] Iniciando processamento...`);
    let browser;

    try {
        // Configuração vital para rodar no EasyPanel/Docker sem quebrar
        browser = await puppeteer.launch({
            headless: true,
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome', 
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ]
        });

        const page = await browser.newPage();

        // OTTIMIZAÇÃO: Bloqueia imagens, fontes e CSS para o robô ficar mais rápido e leve
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        // ====================================================================
        // LÓGICA DE NAVEGAÇÃO DO ROBÔ NO PORTAL PGMEI
        // ====================================================================

        console.log(`[${cnpj}] Passo 1: Acessando portal PGMEI...`);
        await page.goto('http://www8.receita.fazenda.gov.br/SimplesNacional/Aplicacoes/ATSPO/pgmei.app/Identificacao', { waitUntil: 'networkidle2', timeout: 30000 });

        console.log(`[${cnpj}] Passo 2: Digitando CNPJ...`);
        await page.waitForSelector('#cnpj', { timeout: 10000 }); // Aguarda o campo de CNPJ aparecer
        await page.type('#cnpj', cnpj, { delay: 50 }); // Digita como um humano

        console.log(`[${cnpj}] Passo 3: Entrando no sistema...`);
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2' }),
            page.click('button[type="submit"]') // Clica no botão "Continuar"
        ]);

        // Verifica se a Receita retornou algum erro (ex: CNPJ inválido ou não é MEI)
        const alertError = await page.$('.alert-danger');
        if (alertError) {
            const erroTexto = await page.$eval('.alert-danger', el => el.innerText);
            throw new Error(`Mensagem da Receita: ${erroTexto.trim()}`);
        }

        console.log(`[${cnpj}] Passo 4: Acessando menu de Emissão...`);
        // Procura o link que leva para a emissão da guia
        const menuEmitir = await page.$('a[href*="emissao"]');
        if (!menuEmitir) throw new Error("Menu 'Emitir Guia' não encontrado. O layout do site pode ter mudado.");
        
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2' }),
            menuEmitir.click()
        ]);

        console.log(`[${cnpj}] Passo 5: Selecionando o ano atual...`);
        const anoAtual = new Date().getFullYear().toString(); // Pega o ano atual dinamicamente (ex: "2026")
        
        // Tenta selecionar o ano no dropdown (select)
        const selectAno = await page.$('select'); 
        if (selectAno) {
            await page.select('select', anoAtual);
            await Promise.all([
                page.waitForNavigation({ waitUntil: 'networkidle2' }),
                page.click('button[type="submit"]') // Clica em OK/Continuar
            ]);
        }

        console.log(`[${cnpj}] Sucesso! Robô chegou na tabela de apuração dos meses.`);
        const urlFinal = page.url();

        await browser.close();

        // Retorna os dados para o seu n8n
        return res.status(200).json({
            sucesso: true,
            cnpj: cnpj,
            ano_apuracao: anoAtual,
            status: "Navegação concluída com sucesso até a tabela de meses",
            url_parada: urlFinal
        });

    } catch (error) {
        console.error(`[${cnpj}] Erro no processamento:`, error.message);
        if (browser) await browser.close();
        return res.status(500).json({ sucesso: false, erro: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 API do Robô PGMEI rodando na porta ${PORT}`);
});
