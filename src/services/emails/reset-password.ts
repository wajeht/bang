import { sendMail } from './mail';
import env from '../../configs/env';

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
	const html = generateResetPasswordHTML(props);

	await sendMail({
		to: props.email,
		subject: 'Reset password',
		html,
	});
}
