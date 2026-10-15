import { config } from '../config.js';
import { getSettings } from '../db.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Same mark as the site logo, one colour, inline SVG so it renders in clients that block images.
const MARK = '<svg width="28" height="28" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle"><circle cx="16" cy="16" r="12.5" stroke="#d9a441" stroke-width="1.6" fill="none"/><path d="M16 1.5v6M16 24.5v6" stroke="#d9a441" stroke-width="1.6"/><rect x="12.4" y="9.2" width="7.2" height="11.6" fill="#d9a441"/></svg>';

function layout({ preheader, title, intro, button, link, outro, note }) {
  const name = esc(getSettings().site_name || 'Meridian');
  return `<!doctype html><html><body style="margin:0;background:#141413;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#ecebe6">
<span style="display:none;max-height:0;overflow:hidden">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#141413;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#1c1c1a;border:1px solid #2e2e2b;border-radius:6px">
<tr><td style="padding:22px 28px;border-bottom:1px solid #2e2e2b">${MARK}<span style="font-size:17px;font-weight:600;letter-spacing:.01em;margin-left:8px;vertical-align:middle">${name}</span></td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 14px;font-size:21px;line-height:1.25;font-weight:600;color:#f4f3ee">${esc(title)}</h1>
<p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#b9b8b0">${intro}</p>
${button ? `<p style="margin:0 0 22px"><a href="${esc(link)}" style="display:inline-block;background:#d9a441;color:#17140c;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:4px">${esc(button)}</a></p>
<p style="margin:0 0 22px;font-size:12px;line-height:1.5;color:#8a897f">Button not working? Paste this address into your browser:<br><a href="${esc(link)}" style="color:#d9a441;word-break:break-all">${esc(link)}</a></p>` : ''}
${outro ? `<p style="margin:0;font-size:14px;line-height:1.6;color:#b9b8b0">${outro}</p>` : ''}
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #2e2e2b;font-size:12px;line-height:1.5;color:#77766d">${note || `You received this because of activity on your ${name} account.`}<br>Trading involves risk. ${name} is educational software; nothing here is financial advice.</td></tr>
</table></td></tr></table></body></html>`;
}

const url = (p, token) => `${config.appUrl}${p}?token=${encodeURIComponent(token)}`;

export const templates = {
  verifyEmail: ({ name, token, hours }) => {
    const link = url('/verify-email', token);
    return { link, subject: 'Confirm your email address', text: `Hi ${name},\n\nConfirm your email: ${link}\n\nThe link works for ${hours} hours. If you did not create an account, ignore this message.`,
      html: layout({ preheader: 'Confirm your email to unlock signals and paper trading.', title: 'Confirm your email address', intro: `Hi ${esc(name)}, confirm this address to open the signals desk and place paper trades. The link is valid for ${hours} hours and works once.`, button: 'Confirm email', link, outro: 'If you did not create an account you can ignore this message.' }) };
  },
  resetPassword: ({ name, token, minutes }) => {
    const link = url('/reset-password', token);
    return { link, subject: 'Reset your password', text: `Hi ${name},\n\nReset your password: ${link}\n\nThe link works once and expires in ${minutes} minutes. If you did not ask for this, your password is unchanged.`,
      html: layout({ preheader: 'Use this link to choose a new password.', title: 'Reset your password', intro: `Hi ${esc(name)}, someone asked to reset the password on this account. The link works once and expires in ${minutes} minutes.`, button: 'Choose a new password', link, outro: 'If this was not you, ignore this message. Your password stays as it is.' }) };
  },
  changeEmail: ({ name, token, newEmail, hours }) => {
    const link = url('/confirm-email', token);
    return { link, subject: 'Confirm your new email address', text: `Hi ${name},\n\nConfirm ${newEmail} as your new sign-in email: ${link}\n\nValid for ${hours} hour(s).`,
      html: layout({ preheader: 'Confirm the new email address for your account.', title: 'Confirm your new email', intro: `Hi ${esc(name)}, confirm <strong style="color:#ecebe6">${esc(newEmail)}</strong> as the sign-in address for your account. The link is valid for ${hours} hour(s).`, button: 'Confirm new email', link, outro: 'Your current address stays active until you confirm.' }) };
  },
  emailChanged: ({ name, newEmail }) => ({ subject: 'Your sign-in email was changed', text: `Hi ${name},\n\nThe sign-in email on your account was changed to ${newEmail}. If this was not you, contact the administrator immediately.`,
    html: layout({ preheader: 'The email on your account was changed.', title: 'Your sign-in email was changed', intro: `Hi ${esc(name)}, the sign-in address on your account is now <strong style="color:#ecebe6">${esc(newEmail)}</strong>.`, outro: 'If this was not you, contact the administrator immediately.', note: 'Security notice' }) }),
  passwordChanged: ({ name, when }) => ({ subject: 'Your password was changed', text: `Hi ${name},\n\nYour password was changed on ${when}. Other devices were signed out. If this was not you, reset your password now.`,
    html: layout({ preheader: 'Your password was changed.', title: 'Your password was changed', intro: `Hi ${esc(name)}, your password was changed on ${esc(when)}. All other devices have been signed out.`, button: 'This was not me', link: `${config.appUrl}/forgot-password`, outro: 'If you made this change, no action is needed.', note: 'Security notice' }) }),
  newLogin: ({ name, when, ip, device }) => ({ subject: 'New sign-in to your account', text: `Hi ${name},\n\nNew sign-in on ${when} from ${ip} (${device}). If this was not you, change your password.`,
    html: layout({ preheader: 'We noticed a sign-in from a new device.', title: 'New sign-in to your account', intro: `Hi ${esc(name)}, we noticed a sign-in from a device we have not seen before.<br><br><span style="color:#ecebe6">${esc(when)}<br>IP ${esc(ip)}<br>${esc(device)}</span>`, button: 'Secure my account', link: `${config.appUrl}/forgot-password`, outro: 'If this was you, no action is needed.', note: 'Security notice' }) }),
  twoFactor: ({ name, enabled }) => ({ subject: `Two-factor authentication ${enabled ? 'enabled' : 'disabled'}`, text: `Hi ${name},\n\nTwo-factor authentication was ${enabled ? 'enabled' : 'disabled'} on your account.`,
    html: layout({ preheader: `Two-factor authentication ${enabled ? 'enabled' : 'disabled'}.`, title: `Two-factor authentication ${enabled ? 'enabled' : 'disabled'}`, intro: `Hi ${esc(name)}, two-factor authentication was ${enabled ? 'turned on' : 'turned off'} for your account.`, outro: 'If this was not you, reset your password immediately.', note: 'Security notice' }) }),
  adminReset: ({ name, token, minutes }) => {
    const link = url('/reset-password', token);
    return { link, subject: 'An administrator asked you to reset your password', text: `Hi ${name},\n\nAn administrator required a password reset for your account: ${link}\n\nExpires in ${minutes} minutes.`,
      html: layout({ preheader: 'A password reset is required for your account.', title: 'Password reset required', intro: `Hi ${esc(name)}, an administrator has required a password reset for your account. You were signed out on all devices.`, button: 'Choose a new password', link, outro: `The link works once and expires in ${minutes} minutes.` }) };
  },
};
