FROM ubuntu:jammy

RUN apt-get -y update

RUN apt-get -y install git curl build-essential

RUN curl -sL https://deb.nodesource.com/setup_14.x | bash -

RUN apt-get -y install nodejs

WORKDIR /app

COPY ./package.json ./

RUN npm install

COPY ./ ./

RUN mkdir /app/ls

RUN touch ./ls/receiveIndex

CMD curl $CONFIG_URL > config.json && npm start