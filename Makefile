.PHONY: release release-canary

release:
	npm publish --access public

release-canary:
	npm publish --access public --tag canary
