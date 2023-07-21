import nodemailer from 'nodemailer';
import emailConfig from '../configs/mail.config';

interface MailData {
	to: string;
	subject: string;
	html: string;
}

interface WelcomeData {
	name: string;
}

interface BirthdayData extends WelcomeData {
	age: number;
}

const transporter = nodemailer.createTransport(emailConfig);

function generateWelcomeHTML({ name }: WelcomeData): string {
	return `
    <h1>Welcome ${name}!</h1>
    <p>Thanks for joining us.</p>
  `;
}

function generateBirthdayHTML({ name, age }: BirthdayData): string {
	return `
    <h1>Happy Birthday ${name}!</h1>
    <p>Congratulations on turning ${age}!</p>
  `;
}

async function sendMail({ to, subject, html }: MailData): Promise<void> {
	const mailOptions = {
		from: process.env.EMAIL,
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

export { sendMail, generateWelcomeHTML, generateBirthdayHTML };
