//go:build !windows

package services

import "os/exec"

// setSysProcAttr 非 Windows 平台不需要特殊处理
func setSysProcAttr(cmd *exec.Cmd) {
	// No-op on non-Windows platforms
}
