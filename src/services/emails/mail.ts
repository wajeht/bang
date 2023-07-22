import nodemailer from 'nodemailer';
import emailConfig from '../../configs/mail.config';
import env from '../../configs/env';

interface MailData {
	to: string;
	subject: string;
	html: string;
}

const map = {
	'verify-email': {
		template: import('./verify-email'),
	},
};

const transporter = nodemailer.createTransport(emailConfig);

export async function sendMail({ to, subject, html }: MailData): Promise<void> {
	const mailOptions = {
		from: env.EMAIL_AUTH_EMAIL,
		to,
		subject,
		html,
	};

	try {
		await transporter.sendMail(mailOptions);
	} catch (error) {
		console.error('Error while sending mail: ', error);
	}
}
