all: lint build

format:
	npx prettier --write .

lint:
	npx prettier --check .
	npx eslint .

build:
	npx tsc --noEmit

clean:
	rm -rf dist .eslintcache

.PHONY: all format lint build clean
