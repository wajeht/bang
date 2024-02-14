<template>
	<div class="min-w-[300px] shadow-xl flex flex-col border-gray-200 border-r-[1px]">
		<!-- logo -->
		<div class="flex items-center h-[66px] p-2">
			<router-link class="btn btn-ghost normal-case text-xl w-full" to="/dashboard">
				<span class="w-full text-left"
					><span class="text-red-600 font-bold mr-1">!!</span>Bang</span
				>
			</router-link>
		</div>

		<!-- menu links -->
		<ul class="menu">
			<li>
				<router-link
					to="/dashboard/history"
					:class="[$route.path.startsWith('/dashboard/history') ? 'active' : '']"
				>
					<i-ic:outline-history />
					History
				</router-link>
			</li>
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
