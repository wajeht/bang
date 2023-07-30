import { sendMail } from '../mailer';
import env from '../../../configs/env';

type Props = {
	token: string;
	email: string;
	name: string;
};

function generateResetPasswordHTML(props: Props): string {
	return `
		<div>
			<h1>Reset your password</h1>
			<p>Hello ${props.name},</p>
			<p>Click the link below to reset your password.</p>
			<a href="${env.DOMAIN}/reset-password?token=${props.token}&email=${props.email}">Reset Password</a>
		</div>
	`;
}

export async function sendResetPassword(props: Props): Promise<void> {
	try {
		const html = generateResetPasswordHTML(props);

		sendMail({
			to: props.email,
			subject: 'Reset password',
			html,
		});

		console.log(`Reset password email sent to ${props.email}`);
	} catch (error) {
		console.error('Error while sending reset password email: ', error);
	}
}
