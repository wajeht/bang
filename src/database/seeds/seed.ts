import { userSeeder } from './user.seeder';
import { bookmarkSeeder } from './bookmark.seeder';

(async function main() {
	await userSeeder();
	await bookmarkSeeder();
})();
