//go:build windows

package services

import (
	"os/exec"
	"syscall"
)

// setSysProcAttr 设置 Windows 特有的进程属性（隐藏控制台窗口）
func setSysProcAttr(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: 0x08000000, // CREATE_NO_WINDOW
	}
}
