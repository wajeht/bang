import { sendMail } from './mail';
import env from '../../configs/env';

type Props = {
	token: string;
	email: string;
	name: string;
};

function generateVerifyEmailHTML(props: Props): string {
	return `
    <h1>Verify your email</h1>
    <p>Hello ${props.name}!</p>
    <p>Thanks for joining us.</p>
    <p>Click the link below to verify your email:</p>
    <a href="${env.DOMAIN}/verify-email?token=${props.token}&email=${props.email}">Verify email</a>
  `;
}

export async function sendVerifyEmail(props: Props): Promise<void> {
	const html = generateVerifyEmailHTML(props);

	await sendMail({
		to: props.email,
		subject: 'Verify your email',
		html,
	});
}
