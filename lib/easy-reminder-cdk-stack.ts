import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import { DynamoEventSource } from "aws-cdk-lib/aws-lambda-event-sources";

export class EasyReminderCdkStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Reminder Table
    const reminderTable = new dynamodb.Table(this, "reminders", {
      partitionKey: {
        name: "reminder_id",
        type: dynamodb.AttributeType.STRING,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Scheduled Reminder Table
    const scheduledTable = new dynamodb.Table(this, "scheduled-reminders", {
      partitionKey: {
        name: "scheduled_id",
        type: dynamodb.AttributeType.STRING,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: "schedule_at",
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
    });

    // defines an AWS Lambda resource
    const reminder = new lambda.Function(this, "ReminderHandler", {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromAsset("lambda"),
      handler: "reminder.handler",
      environment: {
        REMINDER_TABLE_NAME: reminderTable.tableName,
        SCHEDULE_TABLE_NAME: scheduledTable.tableName,
      },
    });

    const notification = new lambda.Function(this, "NotificationHandler", {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromAsset("lambda"),
      handler: "notification.handler",
      environment: {
        SCHEDULE_TABLE_NAME: scheduledTable.tableName,
        SENDER_EMAIl: "dayeno8226@atebin.com",
      },
    });

    notification.addEventSource(
      new DynamoEventSource(scheduledTable, {
        startingPosition: lambda.StartingPosition.LATEST,
        filters: [
          lambda.FilterCriteria.filter({
            eventName: lambda.FilterRule.isEqual("REMOVE"),
          }),
        ],
      })
    );

    // Grant the Lambda function only the necessary SNS actions
    const lambdaRole = notification.role;
    lambdaRole?.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSNSFullAccess")
    );
    lambdaRole?.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSESFullAccess")
    );

    // defines as AWS APIGateway resource
    const api = new apigateway.LambdaRestApi(this, "reminderApi", {
      integrationOptions: {
        proxy: true,
      },
      handler: reminder,
      proxy: false,
    });

    const reminderApi = api.root.addResource("reminder");
    reminderApi.addMethod("GET");
    reminderApi.addMethod("POST");

    const reminderFetch = reminderApi.addResource("{reminder_id}");
    reminderFetch.addMethod("GET");
    reminderFetch.addMethod("PUT");
    reminderFetch.addMethod("DELETE");

    reminderTable.grantReadWriteData(reminder);
    scheduledTable.grantReadWriteData(reminder);

    reminderTable.grantReadWriteData(notification);
  }
}
