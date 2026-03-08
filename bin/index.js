import express from 'express';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

// Ativa o modo furtivo para evitar bloqueios
puppeteer.use(StealthPlugin());

const app = express();
app.use(express.json());

app.post('/gerar-das', async (req, res) => {
    const { cnpj } = req.body;

    if (!cnpj) {
        return res.status(400).json({ sucesso: false, erro: 'CNPJ não informado.' });
    }

    console.log(`[${cnpj}] 🤖 Iniciando robô em modo Ultra-Light...`);
    let browser;

    try {
        // CONFIGURAÇÃO DE ALTA PERFORMANCE PARA DOCKER/EASYPANEL
        browser = await puppeteer.launch({
            headless: true,
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome', 
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-first-run',
                '--no-zygote',
                '--single-process', // Reduz drasticamente uso de RAM
                '--disable-extensions'
            ]
        });

        const page = await browser.newPage();

        // BLOQUEIO AGRESSIVO: Não carrega Imagens, CSS, Fontes ou Analytics
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const allowList = ['document', 'script', 'xhr', 'fetch'];
            if (!allowList.includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        // Timeout estendido para 90 segundos devido à lentidão extrema da Receita
        page.setDefaultNavigationTimeout(90000);

        console.log(`[${cnpj}] 1. Acessando Identificação...`);
        await page.goto('https://www8.receita.fazenda.gov.br/SimplesNacional/Aplicacoes/ATSPO/pgmei.app/Identificacao', { 
            waitUntil: 'networkidle2' 
        });

        console.log(`[${cnpj}] 2. Preenchendo CNPJ...`);
        await page.waitForSelector('#cnpj', { visible: true, timeout: 15000 });
        await page.type('#cnpj', cnpj, { delay: 100 });

        console.log(`[${cnpj}] 3. Autenticando...`);
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2' }),
            page.click('button[type="submit"]')
        ]);

        // Verificação de Erro de Login
        const errorElement = await page.$('.alert-danger');
        if (errorElement) {
            const msg = await page.evaluate(el => el.innerText, errorElement);
            throw new Error(`Receita Federal: ${msg.trim()}`);
        }

        console.log(`[${cnpj}] 4. Login OK! Indo para URL de Emissão...`);
        await page.goto('https://www8.receita.fazenda.gov.br/SimplesNacional/Aplicacoes/ATSPO/pgmei.app/emissao', { 
            waitUntil: 'networkidle2' 
        });

        console.log(`[${cnpj}] 5. Selecionando Ano...`);
        await page.waitForSelector('select', { visible: true });
        
        const anoAtual = new Date().getFullYear().toString();
        await page.select('select', anoAtual);

        console.log(`[${cnpj}] 6. Confirmando Ano...`);
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2' }),
            page.click('button[type="submit"]')
        ]);

        console.log(`[${cnpj}] ✅ Sucesso! Na tela de seleção de meses.`);
        const urlFinal = page.url();

        await browser.close();

        return res.status(200).json({
            sucesso: true,
            cnpj: cnpj,
            ano: anoAtual,
            url_alvo: urlFinal,
            status_servico: "Pronto para emitir guia"
        });

    } catch (error) {
        console.error(`[${cnpj}] ❌ Erro:`, error.message);
        if (browser) {
            try { await browser.close(); } catch (e) { /* ignore */ }
        }
        return res.status(500).json({ sucesso: false, erro: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 API PGMEI rodando na porta ${PORT}`);
});
