# Usa a imagem oficial do Puppeteer que já contém o Chrome configurado
FROM ghcr.io/puppeteer/puppeteer:19.2.2

# Muda para o usuário root para ter permissão de instalar os pacotes
USER root

# Define o diretório de trabalho
WORKDIR /app

# Copia os arquivos de configuração do Node
COPY package*.json ./

# Instala todas as dependências do package.json
RUN npm install

# Copia todo o restante do código do seu projeto
COPY . .

# Expõe a porta que o Express vai utilizar
EXPOSE 3000

# O comando que o EasyPanel vai rodar para ligar a API
CMD ["npm", "start"]
