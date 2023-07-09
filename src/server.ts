import app from './app';

const PORT = 8080;

app.listen(PORT, () => {
	console.log(`Server was started on http://localhost:${PORT}`);
});
