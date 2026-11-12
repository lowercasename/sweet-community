package scripts

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestReleasePreflight(t *testing.T) {
	script, err := filepath.Abs("release.sh")
	if err != nil {
		t.Fatal(err)
	}
	checks := []string{
		"make build", "go vet ./...", "go test ./...", "pnpm typecheck",
		"pnpm check:atomic", "pnpm format:check", "pnpm test", "make e2e",
	}
	cases := append([]string{"success", "dirty checkout", "new commit", "different branch"}, checks...)
	for _, scenario := range cases {
		t.Run(scenario, func(t *testing.T) {
			dir := t.TempDir()
			bin := t.TempDir()
			remote := filepath.Join(t.TempDir(), "origin.git")
			calls := filepath.Join(t.TempDir(), "calls")
			env := []string{
				"PATH=" + bin + ":" + os.Getenv("PATH"), "HOME=" + t.TempDir(),
				"GIT_CONFIG_NOSYSTEM=1", "GIT_CONFIG_GLOBAL=/dev/null",
				"CALLS=" + calls, "SCENARIO=" + scenario,
			}
			run := func(args ...string) string {
				t.Helper()
				cmd := exec.Command(args[0], args[1:]...)
				cmd.Dir, cmd.Env = dir, env
				out, err := cmd.CombinedOutput()
				if err != nil {
					t.Fatalf("%v: %v\n%s", args, err, out)
				}
				return strings.TrimSpace(string(out))
			}
			write := func(path, content string, mode os.FileMode) {
				t.Helper()
				if err := os.WriteFile(path, []byte(content), mode); err != nil {
					t.Fatal(err)
				}
			}
			run("git", "init", "-q", "-b", "main")
			run("git", "config", "user.name", "Test")
			run("git", "config", "user.email", "test@example.invalid")
			run("git", "init", "-q", "--bare", remote)
			run("git", "remote", "add", "origin", remote)
			changelog := "# Changelog\n\n## v1.0.0\n\n- First release.\n"
			write(filepath.Join(dir, "CHANGELOG.md"), changelog, 0600)
			run("git", "add", "CHANGELOG.md")
			run("git", "commit", "-qm", "Initial release")
			run("git", "tag", "v1.0.0")
			run("git", "commit", "--allow-empty", "-qm", "Fix a bug")
			run("git", "push", "-q", "origin", "main", "v1.0.0")
			before := run("git", "rev-parse", "HEAD")
			if err := os.Mkdir(filepath.Join(dir, "web"), 0700); err != nil {
				t.Fatal(err)
			}
			for _, name := range []string{"make", "go", "pnpm"} {
				write(filepath.Join(bin, name), `#!/bin/sh
set -eu
check="${0##*/} $*"
printf '%s\n' "$check" >> "$CALLS"
[ "$check" != "$SCENARIO" ] || exit 1
if [ "$check" = 'make e2e' ]; then
  case "$SCENARIO" in
    'dirty checkout') echo changed >> CHANGELOG.md ;;
    'new commit') git commit --allow-empty -qm 'Concurrent change' ;;
    'different branch') git checkout -qb another ;;
  esac
fi
`, 0700)
			}
			cmd := exec.Command("sh", script, "patch")
			cmd.Dir, cmd.Env = dir, env
			out, err := cmd.CombinedOutput()
			if (err == nil) != (scenario == "success") {
				t.Fatalf("release result: %v\n%s", err, out)
			}
			got, err := os.ReadFile(calls)
			if err != nil {
				t.Fatal(err)
			}
			wantChecks := checks
			for i, check := range checks {
				if scenario == check {
					wantChecks = checks[:i+1]
				}
			}
			if string(got) != strings.Join(wantChecks, "\n")+"\n" {
				t.Fatalf("checks run: %s", got)
			}
			if scenario == "success" {
				released := run("git", "rev-parse", "v1.0.1^{commit}")
				if released != run("git", "rev-parse", "HEAD") || released == before {
					t.Fatal("release tag does not contain the release commit")
				}
				if run("git", "--git-dir", remote, "rev-parse", "main") != released ||
					run("git", "--git-dir", remote, "rev-parse", "v1.0.1^{commit}") != released {
					t.Fatal("release was not pushed")
				}
			} else {
				if run("git", "tag", "--list", "v1.0.1") != "" ||
					run("git", "--git-dir", remote, "rev-parse", "main") != before {
					t.Fatal("failed checks created or pushed a release")
				}
				got, err := os.ReadFile(filepath.Join(dir, "CHANGELOG.md"))
				if scenario == "dirty checkout" {
					changelog += "changed\n"
				}
				if err != nil || string(got) != changelog {
					t.Fatalf("failed checks changed the changelog: %v\n%s", err, got)
				}
				if run("git", "log", "-1", "--format=%s") == "Release v1.0.1" {
					t.Fatal("failed checks created a release commit")
				}
			}
		})
	}
}
