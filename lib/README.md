# Lua Modules Directory (`./lib`)

## Overview
The `./lib` directory is used to store Lua modules that are referenced by `require()` statements in your scripts. This folder serves as the module repository for the Lua bundling system.

## Purpose
When your Lua scripts contain `require()` statements, the build system automatically:
1. Scans for all `require()` calls in your code
2. Resolves the required modules from the `./lib` directory
3. Bundles all dependencies using luabundle 1.6.0 format
4. Creates a self-contained script with all required modules included


## Module Resolution
The system resolves `require()` statements as follows:
- `require("module_name")` → looks for `./lib/module_name.lua` or `./lib/module_name.ttslua`
- `require("subfolder/submodule")` → looks for `./lib/subfolder/submodule.lua` or `./lib/subfolder/submodule.ttslua`

## File Extensions
Supported file extensions:
- `.lua` (preferred)
- `.ttslua` (Tabletop Simulator Lua)

## Example Usage
If your script contains:
```lua
local serpent = require("util/serpent")
local helper = require("myhelper")
```

## Important Notes
- The `./lib` directory is **required** when your scripts use `require()` statements
- If `require()` calls are detected but the `./lib` directory is missing, the build will fail
- Missing modules will cause build errors with specific file path expectations
- Circular dependencies are detected and warned about
- The bundler only activates when `require()` statements are present in your code

## Error Handling
If a required module is missing, you'll see an error like:
```bash
❌ Missing Lua module "module_name" → expected: ./lib/module_name.lua or .ttslua
```