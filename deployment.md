# Aquae - AWS Lambda Deployment Guide

This guide provides step-by-step instructions for deploying the Aquae application to AWS Lambda with an API Gateway trigger.

## Prerequisites

1.  **AWS Account:** You need an AWS account with permissions to create Lambda functions, API Gateway endpoints, and IAM roles.
2.  **Node.js and npm:** Make sure you have Node.js (version 16 or higher) and npm installed on your local machine.
3.  **AWS CLI (Optional but Recommended):** The AWS Command Line Interface can simplify some steps. [Installation Guide](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-install.html).
4.  **Database:** For a production environment on Lambda, you must use a managed database service. The application is configured to work with **Amazon RDS for PostgreSQL**. Follow the `database.md` guide to set up your PostgreSQL instance. **SQLite will not work on Lambda.**

## Deployment Steps

### 1. Prepare the Deployment Package

Your Lambda function needs a `.zip` file containing your application code and all its dependencies.

1.  **Install Production Dependencies:**
    ```bash
    npm install --production
    ```

2.  **Create the Deployment Archive:** Zip the contents of your project folder. Make sure to include `node_modules`.
    ```bash
    zip -r aquae-deployment.zip . -x ".*" "*/.DS_Store" "logs/*" "aquae.db*"
    ```
    This command creates `aquae-deployment.zip` and excludes hidden files, logs, and local SQLite databases.

### 2. Create the Lambda Function

1.  **Open the AWS Lambda Console:** Navigate to the [Lambda service](https://console.aws.amazon.com/lambda/) in your AWS account.
2.  **Create Function:**
    * Select **"Author from scratch"**.
    * **Function name:** `aquae-server`
    * **Runtime:** `Node.js 18.x` (or a newer supported version).
    * **Architecture:** `x86_64`
    * **Permissions:** Choose **"Create a new role with basic Lambda permissions"**. You may need to add VPC permissions later if your database is in a VPC.
    * Click **"Create function"**.

### 3. Configure the Lambda Function

1.  **Upload Code:**
    * In the **"Code source"** section, click **"Upload from"** and select **".zip file"**.
    * Upload the `aquae-deployment.zip` file you created.

2.  **Edit Handler:**
    * In the **"Runtime settings"** section, click **"Edit"**.
    * Set the **Handler** to `lambda.handler`. This tells Lambda to execute the `handler` function from the `lambda.js` file.
    * Click **"Save"**.

3.  **Set Environment Variables:**
    * Go to the **"Configuration"** tab and select **"Environment variables"**.
    * Add the following key-value pairs, adjusting them for your environment:
        * `DB_CLIENT`: `postgres`
        * `PG_HOST`: Your RDS endpoint URL.
        * `PG_PORT`: `5432`
        * `PG_USER`: `aquae_user`
        * `PG_PASSWORD`: The password you set for your database user.
        * `PG_DATABASE`: `aquae`
        * `NODE_ENV`: `production`

4.  **Adjust Timeout:**
    * In the **"Configuration"** tab under **"General configuration"**, click **"Edit"**.
    * Set the **Timeout** to `30` seconds. This gives the function enough time for cold starts and database queries.

### 4. Create an API Gateway Trigger

1.  **Add Trigger:**
    * In your Lambda function's overview, click **"Add trigger"**.
    * Select **"API Gateway"** from the list.
    * Choose **"Create an API"**.
    * Select **"HTTP API"**.
    * **Security:** Choose **"Open"** for simplicity, or configure authentication as needed.
    * Click **"Add"**.

2.  **Get Your API Endpoint:**
    * After the trigger is created, you will see an **API endpoint URL** in the trigger details. This is the public URL for your Aquae application.

### 5. Final Steps

1.  **Test Your Endpoint:** Open the API endpoint URL in your browser. You should see the Aquae application load.
2.  **Configure Custom Domain (Optional):** For a more professional URL, you can configure a custom domain for your API Gateway endpoint using Amazon Route 53.

You have now successfully deployed the Aquae application to AWS Lambda!

