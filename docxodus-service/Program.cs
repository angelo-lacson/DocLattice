using System.Text.Json;
using System.Text.Json.Serialization;
using Docxodus;
using DocxodusService.Models;

var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

var jsonOptions = new JsonSerializerOptions
{
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    WriteIndented = false,
};

app.MapGet("/health", () => Results.Ok(new { status = "healthy" }));

app.MapPost("/parse", async (ParseRequest request) =>
{
    if (string.IsNullOrWhiteSpace(request.DocxBase64))
    {
        return Results.BadRequest(new { error = "docx_base64 field is required" });
    }

    try
    {
        var docxBytes = Convert.FromBase64String(request.DocxBase64);
        var filename = request.Filename ?? "document.docx";
        var wmlDoc = new WmlDocument(filename, docxBytes);
        var export = OpenContractExporter.Export(wmlDoc);

        return Results.Json(export, jsonOptions);
    }
    catch (FormatException)
    {
        return Results.BadRequest(new { error = "Invalid base64 encoding in docx_base64" });
    }
    catch (Exception ex)
    {
        return Results.Problem(
            detail: ex.Message,
            statusCode: 422,
            title: "DOCX parsing failed"
        );
    }
});

app.Run();
