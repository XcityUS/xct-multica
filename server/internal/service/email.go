package service

import (
	"fmt"
	"html"
	"os"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/resend/resend-go/v2"
)

func currentYear() int {
	return time.Now().Year()
}

// maxSubjectFieldRunes bounds how much user-controlled text (workspace name,
// inviter name) can land in an email Subject. Prevents attackers from stuffing
// a full phishing pitch into a workspace name that gets sent from our domain.
const maxSubjectFieldRunes = 60

type EmailService struct {
	client    *resend.Client
	fromEmail string
}

func NewEmailService() *EmailService {
	apiKey := os.Getenv("RESEND_API_KEY")
	from := os.Getenv("RESEND_FROM_EMAIL")
	if from == "" {
		from = "noreply@xct.dev"
	}

	var client *resend.Client
	if apiKey != "" {
		client = resend.NewClient(apiKey)
	}

	return &EmailService{
		client:    client,
		fromEmail: from,
	}
}

// SendVerificationCode sends a one-time login code. The code is server-generated
// (6-digit numeric) so no user-controlled text reaches the email body here.
// If that ever changes, escape the user-controlled fields the same way
// SendInvitationEmail does.
func (s *EmailService) SendVerificationCode(to, code string) error {
	if s.client == nil {
		fmt.Printf("[DEV] Verification code for %s: %s\n", to, code)
		return nil
	}

	params := &resend.SendEmailRequest{
		From:    s.fromEmail,
		To:      []string{to},
		Subject: "Your XCT Workspace verification code",
		Html: fmt.Sprintf(
			`<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 20px;">
<tr><td align="center">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
  <tr><td style="background-color:#18181b;padding:24px 32px;text-align:center;">
    <span style="color:#ffffff;font-size:18px;font-weight:600;letter-spacing:0.5px;">XCT Workspace</span>
  </td></tr>
  <tr><td style="padding:40px 32px;">
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#18181b;">Verification Code</h2>
    <p style="margin:0 0 24px;font-size:14px;color:#71717a;line-height:1.5;">Enter the following code to verify your identity. This code is valid for 10 minutes.</p>
    <table role="presentation" width="100%%" cellpadding="0" cellspacing="0">
      <tr><td style="background-color:#f4f4f5;border-radius:8px;padding:20px;text-align:center;">
        <span style="font-size:36px;font-weight:700;letter-spacing:10px;color:#18181b;font-family:'Courier New',monospace;">%s</span>
      </td></tr>
    </table>
    <p style="margin:24px 0 0;font-size:13px;color:#a1a1aa;line-height:1.5;">If you didn't request this code, you can safely ignore this email. Someone may have entered your email address by mistake.</p>
  </td></tr>
  <tr><td style="padding:20px 32px;border-top:1px solid #e4e4e7;text-align:center;">
    <p style="margin:0;font-size:12px;color:#a1a1aa;">© %d XCT Workspace. All rights reserved.</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`, code, currentYear()),
	}

	_, err := s.client.Emails.Send(params)
	return err
}

// SendInvitationEmail notifies the invitee that they have been invited to a workspace.
// invitationID is included in the URL so the email deep-links to /invite/{id}.
func (s *EmailService) SendInvitationEmail(to, inviterName, workspaceName, invitationID string) error {
	appURL := strings.TrimSpace(os.Getenv("FRONTEND_ORIGIN"))
	if appURL == "" {
		appURL = "https://xct.dev"
	}
	inviteURL := fmt.Sprintf("%s/invite/%s", appURL, invitationID)

	if s.client == nil {
		fmt.Printf("[DEV] Invitation email to %s: %s invited you to %s — %s\n", to, inviterName, workspaceName, inviteURL)
		return nil
	}

	params := buildInvitationParams(s.fromEmail, to, inviterName, workspaceName, inviteURL)
	_, err := s.client.Emails.Send(params)
	return err
}

// buildInvitationParams assembles the Resend request for an invitation email.
// Separated from SendInvitationEmail so the sanitization behavior is unit-testable
// without needing to mock the Resend SDK.
func buildInvitationParams(from, to, inviterName, workspaceName, inviteURL string) *resend.SendEmailRequest {
	safeWorkspace := html.EscapeString(workspaceName)
	safeInviter := html.EscapeString(inviterName)
	subjectInviter := sanitizeSubjectField(inviterName)
	subjectWorkspace := sanitizeSubjectField(workspaceName)

	return &resend.SendEmailRequest{
		From:    from,
		To:      []string{to},
		Subject: fmt.Sprintf("%s invited you to %s on XCT Workspace", subjectInviter, subjectWorkspace),
		Html: fmt.Sprintf(
			`<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 20px;">
<tr><td align="center">
<table role="presentation" width="520" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
  <tr><td style="background-color:#18181b;padding:24px 32px;text-align:center;">
    <span style="color:#ffffff;font-size:18px;font-weight:600;letter-spacing:0.5px;">XCT Workspace</span>
  </td></tr>
  <tr><td style="padding:40px 32px;">
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#18181b;">You're invited to join %s</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#3f3f46;line-height:1.6;"><strong style="color:#18181b;">%s</strong> invited you to collaborate in the <strong style="color:#18181b;">%s</strong> workspace.</p>
    <table role="presentation" width="100%%" cellpadding="0" cellspacing="0">
      <tr><td align="center" style="padding:8px 0 24px;">
        <a href="%s" style="display:inline-block;padding:14px 32px;background-color:#18181b;color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;">Accept Invitation</a>
      </td></tr>
    </table>
    <p style="margin:0;font-size:13px;color:#a1a1aa;line-height:1.5;">You'll need to sign in or create an account to accept this invitation. If you weren't expecting this email, you can safely ignore it.</p>
  </td></tr>
  <tr><td style="padding:20px 32px;border-top:1px solid #e4e4e7;text-align:center;">
    <p style="margin:0;font-size:12px;color:#a1a1aa;">© %d XCT Workspace. All rights reserved.</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`, safeWorkspace, safeInviter, safeWorkspace, inviteURL, currentYear()),
	}
}

// sanitizeSubjectField prepares user-controlled text for the email Subject line.
// Subject is not HTML-rendered, so HTML-escaping would leak literal entities
// (e.g. &lt;script&gt;) into the recipient's inbox. Instead strip control
// characters (defense in depth against header-injection-adjacent abuse even
// though Resend also filters CR/LF) and cap length so attackers can't stuff
// a full phishing subject into a workspace name.
func sanitizeSubjectField(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range s {
		if unicode.IsControl(r) {
			continue
		}
		b.WriteRune(r)
	}
	cleaned := b.String()
	if utf8.RuneCountInString(cleaned) <= maxSubjectFieldRunes {
		return cleaned
	}
	runes := []rune(cleaned)
	return string(runes[:maxSubjectFieldRunes-1]) + "…"
}
