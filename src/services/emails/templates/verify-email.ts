import { sendMail } from '../mailer';
import env from '../../../configs/env';

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
	try {
		const html = generateVerifyEmailHTML(props);

		sendMail({
			to: props.email,
			subject: 'Verify your email',
			html,
		});

		console.log(`Verify email sent to ${props.email}`);
	} catch (error) {
		console.error('Error while sending verify email: ', error);
	}
}
