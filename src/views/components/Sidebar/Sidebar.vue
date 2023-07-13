<template>
	<div class="min-w-[300px] shadow-xl flex flex-col">
		<!-- logo -->
		<div class="flex items-center h-[66px] p-2">
			<router-link class="btn btn-ghost normal-case text-xl w-full" to="/dashboard">
				<span class="w-full text-left">Bang</span>
			</router-link>
		</div>

		<!-- menu links -->
		<ul class="menu">
			<li>
				<router-link
					to="/dashboard/commands"
					:class="[$route.path.startsWith('/dashboard/commands') ? 'active' : '']"
				>
					<i-ci:command />
					Commands
				</router-link>
			</li>
			<li>
				<router-link
					to="/dashboard/bookmarks"
					:class="[$route.path.startsWith('/dashboard/bookmarks') ? 'active' : '']"
				>
					<i-ic:outline-bookmarks />
					Bookmarks
				</router-link>
			</li>
			<li>
				<router-link
					to="/dashboard/settings"
					:class="[$route.path.startsWith('/dashboard/settings') ? 'active' : '']"
				>
					<i-bi:gear />
					Settings
				</router-link>
			</li>
		</ul>
	</div>
</template>
