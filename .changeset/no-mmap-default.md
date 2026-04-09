---
"a2go": patch
---

fix: add --no-mmap as default for llama-server to prevent NV hang on large models

mmap causes llama-server to hang on network volumes when loading large models
(191 GB+) with cold NFS cache. --no-mmap uses sequential reads instead,
which is reliable on all storage types and reduces host RAM usage by 83-99%.
