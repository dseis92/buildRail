/* Test-only filesystem seam: redirect a real Git system-attributes read to a
 * temporary fixture. Never inspect GIT_ATTR_NOSYSTEM or implement attribute
 * semantics here: Git itself must decide whether to open/parse this source.
 * Only the exact configured read-only path is redirected; no host file changes.
 */
#define _GNU_SOURCE
#include <fcntl.h>
#include <stdarg.h>
#include <stdlib.h>
#include <string.h>
#if !defined(__APPLE__)
#include <dlfcn.h>
#endif

static const char *fixture_path(const char *name, int flags) {
  const char *system = getenv("BR3_TEST_SYSTEM_PATH");
  const char *fixture = getenv("BR3_TEST_ATTRIBUTES");
  if ((flags & O_ACCMODE) == O_RDONLY && system && fixture && !strcmp(name, system))
    return fixture;
  return name;
}

#if defined(__APPLE__)
static int redirected_open(const char *name, int flags, ...) {
  mode_t mode = 0;
  if (flags & O_CREAT) {
    va_list args; va_start(args, flags); mode = va_arg(args, int); va_end(args);
  }
  return open(fixture_path(name, flags), flags, mode);
}
__attribute__((used)) static const struct {
  const void *replacement;
  const void *original;
} pair __attribute__((section("__DATA,__interpose"))) = {
  (const void *)redirected_open, (const void *)open
};
#else
/* Linux equivalent for runners using LD_PRELOAD. */
#define INTERPOSE_OPEN(symbol) \
int symbol(const char *name, int flags, ...) { \
  mode_t mode = 0; \
  if (flags & O_CREAT) { \
    va_list args; va_start(args, flags); mode = va_arg(args, int); va_end(args); \
  } \
  int (*original)(const char *, int, ...) = dlsym(RTLD_NEXT, #symbol); \
  return original(fixture_path(name, flags), flags, mode); \
}
INTERPOSE_OPEN(open)
INTERPOSE_OPEN(open64)
#endif
