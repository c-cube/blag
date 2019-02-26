
build: build-ts
	zola build
	@echo "content is in public/"

serve:
	zola serve

TSC_OPTS= 
#TSC_OPTS= --sourceMap
STATIC= static/sudoku_solve_wrap.js static/sudoku_with_sat.js

build-ts: $(STATIC)

static/sudoku_solve_wrap.js: ts/sudoku_solve_wrap.ts
	tsc $(TSC_OPTS) $< --outFile $@  --lib 'es7, webworker, webworker.importscripts' 

static/sudoku_with_sat.js: ts/sudoku_with_sat.ts
	tsc $(TSC_OPTS) $< --outFile $@ --lib 'es7, dom'

SERVER_HOME="/home/www-data/blag/"

push: build
	rsync -tavu public/* "simon@goutte.cedeela.fr:$(SERVER_HOME)"

watch-ts:
	while find Makefile content/ ts/ -print0 | xargs -0 inotifywait -e delete_self -e modify ; do \
		echo "============ at `date` ==========" ; \
		make; \
	done

clean-ts:
	rm $(STATIC) || true

.PHONY: build-ts clean-ts
