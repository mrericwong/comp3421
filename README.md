# Environment Setup and Project Initialization

## Install Environment Requirements
To set up your environment, run the following commands:
```
# Install Node.js (if not already)
sudo apt update
sudo apt install nodejs npm

# Check the versions
node -v
npm -v
```

## Initialize and Install Project
If you don't have a `package.json` file in your project directory, create one by running:
```
npm init -y
```
Next, install the required package
```
npm install express multer sqlite3 uuid
```
