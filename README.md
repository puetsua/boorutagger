# BooruTagger

Desktop app for captioning image datasets used in LoRA training. Each image keeps a sidecar `.txt` beside it, with comma-separated tags in the order you set.

Open a folder of images. Filter the working set, select one image or many, and edit the tags. Changes are written back to the `.txt` files. The earlier design mocks are in `design/`.

## Develop

```sh
npm install
npm run tauri dev
```
