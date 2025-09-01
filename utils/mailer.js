const sgMail = require("@sendgrid/mail");
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

async function sendOtpMail({ to, code }) {
  const msg = {
    to,
    from: process.env.SENDGRID_FROM, // must be verified
    subject: "Your verification code",
    text: `Your verification code is ${code}. It expires in 10 minutes.`,
    html: `<p>Your verification code is <b>${code}</b>. It expires in 10 minutes.</p>`,
  };

  await sgMail.send(msg);
}

module.exports = { sendOtpMail };
