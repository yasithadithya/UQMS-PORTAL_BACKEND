import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'UQMS API',
      version: '1.0.0',
      description: 'UQMS backend REST API with authentication and user management',
      contact: {
        name: 'API Support',
      },
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT || 5000}`,
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT token',
        },
      },
      schemas: {
        VesselType: {
          type: 'object',
          required: ['group', 'name'],
          properties: {
            _id: {
              type: 'string',
              description: 'Auto-generated MongoDB ID',
            },
            group: {
              type: 'string',
              description: 'Vessel type group',
              example: 'Cargo',
            },
            name: {
              type: 'string',
              description: 'Vessel type name',
              example: 'Bulk Carrier',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        VesselCode: {
          type: 'object',
          required: ['code', 'description'],
          properties: {
            _id: {
              type: 'string',
              description: 'Auto-generated MongoDB ID',
            },
            code: {
              type: 'string',
              description: 'Vessel code identifier',
              example: 'VC01',
            },
            description: {
              type: 'string',
              description: 'Vessel code description',
              example: 'Standard Cargo Code 01',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        RecEquipQues: {
          type: 'object',
          required: ['codeRefNo', 'description'],
          properties: {
            _id: {
              type: 'string',
              description: 'Auto-generated MongoDB ID',
            },
            codeRefNo: {
              type: 'string',
              description: 'Equipment question code reference number (can be duplicate)',
              example: '11.4',
            },
            description: {
              type: 'string',
              description: 'Equipment question description',
              example: 'Total number of Life rafts (Total number of persons accommodated)',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
            },
             updatedAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        VesselEquipmentRecord: {
          type: 'object',
          required: ['vesselId', 'surveyReportId', 'equipmentRecords'],
          properties: {
            _id: {
              type: 'string',
              description: 'Auto-generated MongoDB ID',
            },
            vesselId: {
              type: 'string',
              description: 'Vessel ID reference',
              example: '60c72b2f9b1d8b2d1c8b4567',
            },
            surveyReportId: {
              type: 'string',
              description: 'First Entry Survey Report ID reference',
              example: '60c72b2f9b1d8b2d1c8b4569',
            },
            equipmentRecords: {
              type: 'array',
              items: {
                type: 'object',
                required: ['questionId', 'status'],
                properties: {
                  questionId: {
                    type: 'string',
                    description: 'RecEquipQues ID reference',
                    example: '60c72b2f9b1d8b2d1c8b4568',
                  },
                  status: {
                    type: 'string',
                    enum: ['Provided', 'Not Provided', 'Not Applicable'],
                    example: 'Provided',
                  },
                  remarks: {
                    type: 'string',
                    example: 'Inspected and certified.',
                  },
                },
              },
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        SurveyType: {
          type: 'object',
          required: ['code', 'name'],
          properties: {
            _id: {
              type: 'string',
              description: 'Auto-generated MongoDB ID',
            },
            code: {
              type: 'string',
              description: 'Survey type code',
              example: 'ST01',
            },
            name: {
              type: 'string',
              description: 'Survey type name',
              example: 'Initial Survey',
            },
            description: {
              type: 'string',
              description: 'Optional description',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        AreaOfOperation: {
          type: 'object',
          required: ['AreaCategory', 'description'],
          properties: {
            _id: {
              type: 'string',
              description: 'Auto-generated MongoDB ID',
            },
            AreaCategory: {
              type: 'string',
              description: 'Area of operation category',
              example: 'Coastal',
            },
            description: {
              type: 'string',
              description: 'Area description',
              example: 'Within 20 nautical miles from shore',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        Request: {
          type: 'object',
          required: [
            'requestNumber',
            'imoNumber',
            'companyName',
            'contactPersonName',
            'contactPersonNumber',
            'sector',
            'vesselType',
            'areaOfOperation',
            'surveyTypes',
            'status',
          ],
          properties: {
            _id: {
              type: 'string',
              description: 'Auto-generated MongoDB ID',
            },
            requestNumber: {
              type: 'string',
              description: 'Generated request number',
              example: 'RQ0001',
            },
            uqmsNumber: {
              type: 'string',
              description: 'Optional UQMS number',
            },
            imoNumber: {
              type: 'string',
              description: 'IMO number',
            },
            companyName: {
              type: 'string',
              description: 'Company name',
            },
            contactPersonName: {
              type: 'string',
              description: 'Contact person name',
            },
            contactPersonNumber: {
              type: 'string',
              description: 'Contact person number',
            },
            sector: {
              type: 'string',
              enum: ['marine', 'industrial'],
              description: 'Sector',
            },
            vesselType: {
              type: 'string',
              description: 'Vessel type ID',
            },
            areaOfOperation: {
              type: 'string',
              description: 'Area of operation ID',
            },
            surveyTypes: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'Survey type IDs',
            },
            documents: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  _id: { type: 'string' },
                  name: { type: 'string' },
                  key: { type: 'string' },
                  url: { type: 'string' },
                  contentType: { type: 'string' },
                  size: { type: 'number' },
                  uploadedAt: { type: 'string', format: 'date-time' },
                },
              },
            },
            status: {
              type: 'string',
              description: 'Request status',
              enum: ['active', 'print', 'reject'],
              example: 'active',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        RequestDocument: {
          type: 'object',
          required: ['requestId', 'requestNumber', 'vesselName', 'pdf', 'mimeType', 'filename'],
          properties: {
            _id: {
              type: 'string',
              description: 'Auto-generated MongoDB ID',
            },
            requestId: {
              type: 'string',
              description: 'Linked request ID',
            },
            requestNumber: {
              type: 'string',
              description: 'Request number',
            },
            vesselName: {
              type: 'string',
              description: 'Vessel name',
            },
            pdf: {
              type: 'string',
              format: 'binary',
              description: 'Stored PDF content',
            },
            mimeType: {
              type: 'string',
              example: 'application/pdf',
            },
            filename: {
              type: 'string',
            },
            generatedAt: {
              type: 'string',
              format: 'date-time',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        Role: {
          type: 'object',
          required: ['roleName'],
          properties: {
            _id: {
              type: 'string',
              description: 'Auto-generated MongoDB ID',
            },
            roleName: {
              type: 'string',
              description: 'Name of the role',
              example: 'admin',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        User: {
          type: 'object',
          required: ['username', 'email', 'password', 'role', 'fullName', 'phoneNumber'],
          properties: {
            _id: {
              type: 'string',
              description: 'Auto-generated MongoDB ID',
            },
            username: {
              type: 'string',
              description: 'Unique username',
              example: 'johndoe',
            },
            email: {
              type: 'string',
              format: 'email',
              description: 'Unique email address',
              example: 'john@example.com',
            },
            password: {
              type: 'string',
              description: 'User password (hashed in DB)',
              example: 'SecurePass123!',
            },
            role: {
              type: 'string',
              description: 'Role ID reference',
              example: '507f1f77bcf86cd799439011',
            },
            fullName: {
              type: 'string',
              description: 'Full Name of the user',
              example: 'John Doe',
            },
            nameWithInitials: {
              type: 'string',
              description: 'Name with initials',
              example: 'J. Doe',
            },
            phoneNumber: {
              type: 'string',
              description: 'Contact phone number',
              example: '+1234567890',
            },
            address: {
              type: 'string',
              description: 'Residential or postal address',
              example: '123 Main Street, City',
            },
            dob: {
              type: 'string',
              format: 'date',
              description: 'Date of birth',
              example: '1990-01-01',
            },
            empNumber: {
              type: 'string',
              description: 'Employee registration number',
              example: 'EMP001',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: {
              type: 'string',
              format: 'email',
              example: 'john@example.com',
            },
            password: {
              type: 'string',
              example: 'SecurePass123!',
            },
          },
        },
        LoginResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true,
            },
            token: {
              type: 'string',
              description: 'JWT access token',
            },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                username: { type: 'string' },
                email: { type: 'string' },
                role: { type: 'object' },
              },
            },
          },
        },
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false,
            },
            message: {
              type: 'string',
            },
          },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ['./src/routes/*.ts'],
};

const swaggerSpec = swaggerJsdoc(options);

export default swaggerSpec;
