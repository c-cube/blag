
build:
	zola build
	@echo "content is in public/"

serve:
	zola serve

SERVER_HOME="/home/www-data/blag/"
push: build
	rsync -tavu public/* "simon@goutte.cedeela.fr:$(SERVER_HOME)"
