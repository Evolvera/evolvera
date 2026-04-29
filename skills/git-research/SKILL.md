---
name: git-research
description: Helper skill for cloning git repositories temporarily for research, with automatic cleanup.
---

# Skill: Git Research Helper

## Objetivo
Fornecer ao agente capacidade de clonar repositórios temporariamente para pesquisa, com cleanup automático.

## Como Usar

### 1. No início de cada tarefa de pesquisa:
```bash
# Carregar o helper
source ~/.pi/agent/helpers/git-temp-clone.sh

# Ou para múltiplas leituras do mesmo repo (mais eficiente):
source ~/.pi/agent/helpers/git-temp-worktree.sh
```

### 2. Padrão de Uso - Clone Único:

```bash
source ~/.pi/agent/helpers/git-temp-clone.sh

# Clonar repo
git_temp_clone "https://github.com/user/repo" "main"

# Agora $GIT_TEMP_DIR contém o repo
ls -la "$GIT_TEMP_DIR"
grep -r "pattern" "$GIT_TEMP_DIR"

# Cleanup automático ao fim do script, ou manual:
git_temp_cleanup
```

### 3. Padrão de Uso - Múltiplos Repos (Worktree):

```bash
source ~/.pi/agent/helpers/git-temp-worktree.sh

# Criar worktree (compartilha objetos git!)
worktree_temp_clone "https://github.com/user/repo" "main" "minha-tarefa"

# Trabalhar no diretório
cd /tmp/pi-worktrees/wt-minha-tarefa-$$

# Fazer várias leituras...
grep -r "pattern" .

# Cleanup
worktree_cleanup "/tmp/pi-worktree/..."
```

### 4. Wrapper para comandos rápidos:

```bash
# Clone → Execute → Cleanup (automático)
git_with_temp_clone "https://github.com/user/repo" "main" \
    grep -r "search-term" .
```

## Configurações Recomendadas para Agentes

### Agente de Pesquisa (read-only):
```yaml
---
description: Pesquisa código em repositórios git temporários
tools: read, grep, find, ls, bash
# Adicionar ao prompt:
---

## Git Research Protocol

1. Antes de clonar qualquer repo:
   - Verificar se já foi clonado nesta sessão
   - Usar `git_temp_clone` com `--depth 1 --single-branch`

2. Após pesquisa:
   - Sempre fazer `git_temp_cleanup`
   - OU usar `git_with_temp_clone` que faz cleanup automático

3. Limites de espaço:
   - Manter no máximo 3 clones simultâneos em /tmp
   - Se precisar de mais, usar worktree (compartilha objetos)

4. Verificação de tamanho:
   - `git_temp_size` para ver espaço usado
   - `git_temp_list` para listar clones ativos
```

## Comandos Úteis

```bash
# Ver clones ativos
git_temp_list

# Ver tamanho total
du -sh /tmp/pi-git-clones-*

# Forçar cleanup de tudo
git_temp_cleanup_all

# Limite prático de /tmp
df -h /tmp
```

## Boas Práticas

1. **Sempre usar shallow clone** (`--depth 1`) exceto se precisar de histórico
2. **Usar `--single-branch`** para clonar só o branch necessário
3. **Trap EXIT** já está configurado para cleanup automático
4. **Prefira worktree** se o mesmo repo será lido múltiplas vezes
5. **Nomear clones** para facilitar identificação no cleanup

## Solução de Problemas

### "No space left on device"
```bash
# Limpar todos os clones
git_temp_cleanup_all

# Ver o que está ocupando espaço
du -sh /tmp/*
```

### "Repository is corrupted"
```bash
# Remover e recomeçar
rm -rf /tmp/pi-git-clones-*
rm -rf /tmp/pi-worktrees
```

### Agente crashou e deixou vestígios
```bash
# Cleanup manual
find /tmp -maxdepth 1 -name "pi-*" -type d -mtime +1 -exec rm -rf {} \;
```
