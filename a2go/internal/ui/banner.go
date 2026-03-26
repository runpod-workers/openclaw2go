package ui

import "fmt"

const (
	green  = "\033[32m"
	yellow = "\033[33m"
	red    = "\033[31m"
	dim    = "\033[90m"
	bold   = "\033[1m"
	reset  = "\033[0m"
)

func Banner(title string) {
	fmt.Println()
	fmt.Println("============================================")
	fmt.Printf("  %s%s%s\n", bold, title, reset)
	fmt.Println("============================================")
}

func Step(n int, label string) {
	fmt.Printf("\n  %s[%d]%s %s\n", dim, n, reset, label)
}

func Ok(msg string)      { fmt.Printf("      %s✓%s %s\n", green, reset, msg) }
func Warn(msg string)    { fmt.Printf("      %s!%s %s\n", yellow, reset, msg) }
func Fail(msg string)    { fmt.Printf("      %s✗%s %s\n", red, reset, msg) }
func Info(msg string)    { fmt.Printf("      %s\n", msg) }
func Dimmed(msg string)  { fmt.Printf("      %s%s%s\n", dim, msg, reset) }

func StatusLine(name, state, detail string) {
	var color string
	switch state {
	case "running":
		color = green
	case "starting", "listening":
		color = yellow
	default:
		color = dim
	}
	fmt.Printf("  %-10s %s%-9s%s %s\n", name, color, state, reset, detail)
}
