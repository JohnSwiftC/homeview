# Model & Swatch Compression

Due to model size, it makes sense to compress the model textures down to WebP before use. This accomplishes two things: keep load times low, and keep the size of the repo being hosted on vercel low as well.

# Doing It

The full size models are placed within models-src, an ignored directory. In this directory, the full size models are placed in the same manner described in the jobs array located under `/scripts/compress-models.mjs`.

Compress the models and throw the output to where they need to be with `npm run compress:models`.
