# Unicorn hunt

[unicorn-hunt](https://platane.github.io/unicorn-hunt)

# Dev

```sh

# install
curl -fsSL https://wavedash.com/cli/install.sh | sh

# dev
wavedash dev
bun build ./index.html --outdir dist --watch

# push dev build
rm -r dist ; bun build index.html --outdir dist && wavedash build push

```

> for agent:
> wavedash skill: https://docs.wavedash.com/.well-known/skills/index.json
