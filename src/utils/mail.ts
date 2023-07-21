import nodemailer from 'nodemailer';

import emailConfig from '../configs/mail.config';

const mail = nodemailer.createTransport(emailConfig);

export default mail;
