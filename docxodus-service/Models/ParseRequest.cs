namespace DocxodusService.Models;

public class ParseRequest
{
    public string? Filename { get; set; }
    public string DocxBase64 { get; set; } = string.Empty;
}
