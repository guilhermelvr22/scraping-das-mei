import express from 'express';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

// Ativa o modo furtivo para evitar bloqueios do site da Receita
puppeteer.use(StealthPlugin());

const app = express();
app.use(express.json());

app.post('/gerar-das', async (req, res) => {
    const { cnpj } = req.body;

    if (!cnpj) {
        return res.status(400).json({ sucesso: false, erro: 'CNPJ não informado.' });
    }

    console.log(`[${cnpj}] 🤖 Iniciando robô...`);
    let browser;

    try {
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

        // Otimização de performance (Bloqueia o que não é essencial)
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'font'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        // Configura um timeout global maior (60 segundos) devido à lentidão da Receita
        page.setDefaultNavigationTimeout(60000);

        console.log(`[${cnpj}] 1. Acessando Identificação...`);
        await page.goto('https://www8.receita.fazenda.gov.br/SimplesNacional/Aplicacoes/ATSPO/pgmei.app/Identificacao', { waitUntil: 'networkidle2' });

        console.log(`[${cnpj}] 2. Preenchendo CNPJ...`);
        await page.waitForSelector('#cnpj', { visible: true });
        await page.type('#cnpj', cnpj, { delay: 100 });

        console.log(`[${cnpj}] 3. Autenticando (Aguardando resposta lenta da Receita)...`);
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2' }),
            page.click('button[type="submit"]')
        ]);

        // Verifica erro de login (CNPJ inválido, etc)
        const hasError = await page.$('.alert-danger');
        if (hasError) {
            const msg = await page.$eval('.alert-danger', el => el.innerText);
            throw new Error(`Receita Federal diz: ${msg.trim()}`);
        }

        console.log(`[${cnpj}] 4. Login feito! Indo direto para a URL de Emissão...`);
        // Em vez de procurar o link, vamos direto no link que você me passou
        await page.goto('https://www8.receita.fazenda.gov.br/SimplesNacional/Aplicacoes/ATSPO/pgmei.app/emissao', { waitUntil: 'networkidle2' });

        console.log(`[${cnpj}] 5. Selecionando Ano de Apuração...`);
        // Aguarda o seletor do ano carregar
        await page.waitForSelector('select', { visible: true });
        
        const anoAtual = new Date().getFullYear().toString();
        await page.select('select', anoAtual);

        console.log(`[${cnpj}] 6. Confirmando seleção do ano...`);
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2' }),
            page.click('button[type="submit"]')
        ]);

        console.log(`[${cnpj}] ✅ Sucesso! Chegamos na tela de seleção de meses.`);
        const urlFinal = page.url();

        await browser.close();

        return res.status(200).json({
            sucesso: true,
            cnpj: cnpj,
            ano: anoAtual,
            url_alvo: urlFinal,
            mensagem: "Robô logou e acessou a tabela de meses com sucesso."
        });

    } catch (error) {
        console.error(`[${cnpj}] ❌ Erro:`, error.message);
        if (browser) await browser.close();
        return res.status(500).json({ sucesso: false, erro: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 API PGMEI rodando na porta ${PORT}`);
});
